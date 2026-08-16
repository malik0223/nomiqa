import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OUTBOX_EVENT_TYPES,
  type ChangeRequestDetail,
  type ChangeRequestStatus,
  type ChangeRequestSummary,
  type Paginated,
  type TenantContext,
} from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import type { UpdateCardInput } from '@nomiqa/validation';
import { CardsService } from '../cards/cards.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertScopeCovers, scopeCovers } from '../tenancy/scope.js';
import { BrandingService } from './branding.service.js';
import { changedFieldNames, lockedFieldsTouched } from './card-policy.js';

/**
 * سير الموافقة على تعديلات البطاقات (خارطة الطريق §9.3).
 *
 * الطلب يُنشأ حين تشترط السياسة موافقة، أو حين يمسّ التعديل حقلاً
 * مقفلاً. الفرق بين الحالتين مهم:
 *
 *   - **`requireApproval`**: كل تعديل يمر بمراجعة، والموظف يقدّم طلباً.
 *   - **حقل مقفل**: التعديل ممنوع على الموظف أصلاً؛ يُقدَّم طلباً بدل
 *     أن يُرفض بلا مخرج، فيبقى للمسؤول قرار الاستثناء.
 *
 * في الحالتين البطاقة لا تُلمس حتى الموافقة.
 */
@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly branding: BrandingService,
    private readonly cards: CardsService,
  ) {}

  /**
   * يقرر ما يحدث لتعديل مقترح.
   *
   * يُستدعى من محرر البطاقة قبل أي كتابة. ثلاث نتائج: مرّ، أو يحتاج
   * طلباً، أو ممنوع بلا مخرج (من لا يملك حق التقديم أصلاً).
   */
  async evaluate(
    tenant: TenantContext,
    actorUserId: string,
    cardId: string,
    input: UpdateCardInput,
  ): Promise<
    | { decision: 'allow' }
    | { decision: 'needs_approval'; lockedFields: string[]; reason: 'policy' | 'locked_fields' }
  > {
    const card = await withRlsContext(
      this.prisma,
      { organizationId: tenant.organizationId },
      (tx) =>
        tx.card.findFirst({
          where: { id: cardId, deletedAt: null },
          select: { ownerUserId: true },
        }),
    );

    if (!card) {
      throw new NotFoundException('البطاقة غير موجودة');
    }

    const policy = await this.branding.effectivePolicyForOwner(
      tenant.organizationId,
      card.ownerUserId,
    );

    const touched = lockedFieldsTouched(input as Record<string, unknown>, policy.lockedFields);

    // من يملك حق الموافقة لا يقدّم طلباً لنفسه: مراجعة الشخص لطلبه
    // خطوة شكلية تُبطئ ولا تحمي. القيد الحقيقي أن الصلاحية نادرة.
    const canApprove = scopeCovers(tenant, 'cards:approve', {
      departmentId: null,
      branchId: null,
    });

    if (canApprove) {
      return { decision: 'allow' };
    }

    if (touched.length > 0) {
      return { decision: 'needs_approval', lockedFields: touched, reason: 'locked_fields' };
    }

    if (policy.requireApproval) {
      return { decision: 'needs_approval', lockedFields: [], reason: 'policy' };
    }

    return { decision: 'allow' };
  }

  /**
   * ينشئ طلب تعديل.
   *
   * `baseRevision` يُلتقط الآن ويُقارن عند الموافقة: طلبٌ قُدّم على
   * إصدار قديم قد يكون بُني على نص تغيّر بعده، وتطبيقه أعمى يعيد كتابة
   * تعديل لاحق لم يره مقدّم الطلب ولا المراجع.
   */
  async submit(
    tenant: TenantContext,
    actorUserId: string,
    cardId: string,
    payload: UpdateCardInput,
  ): Promise<{ id: string }> {
    const card = await withRlsContext(
      this.prisma,
      { organizationId: tenant.organizationId },
      (tx) =>
        tx.card.findFirst({
          where: { id: cardId, deletedAt: null },
          select: { id: true, revision: true, ownerUserId: true },
        }),
    );

    if (!card) {
      throw new NotFoundException('البطاقة غير موجودة');
    }

    if (card.ownerUserId !== actorUserId && !tenant.permissions.includes('cards:write')) {
      throw new ForbiddenException('لا تملك حق تعديل هذه البطاقة');
    }

    const created = await withRlsContext(
      this.prisma,
      { organizationId: tenant.organizationId },
      async (tx) => {
        // طلب معلّق سابق لنفس البطاقة من نفس الشخص يُسحب: طلبان
        // متعارضان على بطاقة واحدة يجعلان الموافقة على أحدهما تُبطل
        // الآخر بصمت.
        await tx.cardChangeRequest.updateMany({
          where: { cardId, requestedByUserId: actorUserId, status: 'pending' },
          data: { status: 'withdrawn' },
        });

        const request = await tx.cardChangeRequest.create({
          data: {
            organizationId: tenant.organizationId,
            cardId,
            requestedByUserId: actorUserId,
            payload: payload as never,
            baseRevision: card.revision,
          },
        });

        await tx.outboxEvent.create({
          data: {
            organizationId: tenant.organizationId,
            eventType: OUTBOX_EVENT_TYPES.CHANGE_REQUEST_SUBMITTED,
            payload: { requestId: request.id, cardId },
          },
        });

        return request;
      },
    );

    this.logger.log(`طلب تعديل ${created.id} على البطاقة ${cardId}`);

    return { id: created.id };
  }

  async list(
    tenant: TenantContext,
    status: ChangeRequestStatus | 'all',
    page: number,
    pageSize: number,
  ): Promise<Paginated<ChangeRequestSummary>> {
    const where = status === 'all' ? {} : { status };

    const { rows, total } = await withRlsContext(
      this.prisma,
      { organizationId: tenant.organizationId },
      async (tx) => ({
        rows: await tx.cardChangeRequest.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { card: { select: { slug: true, revision: true } } },
        }),
        total: await tx.cardChangeRequest.count({ where }),
      }),
    );

    const requesterNames = await this.requesterNames(rows.map((row) => row.requestedByUserId));

    return {
      data: rows.map((row) => this.toSummary(row, requesterNames)),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /** طلبات الموظف نفسه — يراها بلا صلاحية موافقة. */
  async listMine(tenant: TenantContext, actorUserId: string): Promise<ChangeRequestSummary[]> {
    const rows = await withRlsContext(
      this.prisma,
      { organizationId: tenant.organizationId },
      (tx) =>
        tx.cardChangeRequest.findMany({
          where: { requestedByUserId: actorUserId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { card: { select: { slug: true, revision: true } } },
        }),
    );

    const names = await this.requesterNames([actorUserId]);
    return rows.map((row) => this.toSummary(row, names));
  }

  async get(tenant: TenantContext, requestId: string): Promise<ChangeRequestDetail> {
    const request = await withRlsContext(
      this.prisma,
      { organizationId: tenant.organizationId },
      (tx) =>
        tx.cardChangeRequest.findFirst({
          where: { id: requestId },
          include: { card: { select: { slug: true, revision: true } } },
        }),
    );

    if (!request) {
      throw new NotFoundException('الطلب غير موجود');
    }

    const payload = request.payload as Record<string, unknown>;
    const current = await this.cards.get(tenant.organizationId, request.cardId);
    const names = await this.requesterNames([request.requestedByUserId]);

    return {
      ...this.toSummary(request, names),
      payload,
      // القيم الحالية للحقول المطلوبة وحدها: المراجع يحتاج «قبل/بعد»
      // لا نسخة كاملة من البطاقة في جسم الاستجابة.
      currentValues: pickCurrentValues(current as unknown as Record<string, unknown>, payload),
    };
  }

  /**
   * يبتّ في طلب.
   *
   * الموافقة تطبّق التعديل عبر `CardsService.update` نفسها التي يستخدمها
   * المحرر: مسار كتابة ثانٍ للبطاقة كان سيتجاوز تدقيق الإصدار وبناء
   * اللقطة ومنطق الروابط.
   */
  async review(
    tenant: TenantContext,
    reviewerUserId: string,
    requestId: string,
    decision: 'approve' | 'reject',
    note: string | null,
  ): Promise<{ status: ChangeRequestStatus }> {
    const request = await withRlsContext(
      this.prisma,
      { organizationId: tenant.organizationId },
      (tx) =>
        tx.cardChangeRequest.findFirst({
          where: { id: requestId },
          include: { card: { select: { id: true, revision: true, ownerUserId: true } } },
        }),
    );

    if (!request) {
      throw new NotFoundException('الطلب غير موجود');
    }

    if (request.status !== 'pending') {
      throw new ConflictException('بُتَّ في هذا الطلب بالفعل');
    }

    const placement = await this.ownerPlacement(tenant.organizationId, request.card.ownerUserId);
    assertScopeCovers(tenant, 'cards:approve', placement);

    if (decision === 'reject') {
      await this.finish(tenant, requestId, 'rejected', reviewerUserId, note);
      return { status: 'rejected' };
    }

    if (request.card.revision !== request.baseRevision) {
      // البطاقة تغيّرت بعد تقديم الطلب: نوسمه stale ولا نطبّقه.
      // تطبيقه كان سيمحو تعديلاً لاحقاً لم يره أحد في هذه الشاشة.
      await this.finish(
        tenant,
        requestId,
        'stale',
        reviewerUserId,
        'تغيّرت البطاقة بعد تقديم الطلب',
      );
      throw new ConflictException('تغيّرت البطاقة بعد تقديم الطلب — اطلب من مقدّمه إعادة إرساله');
    }

    // `bypassPolicy` هنا صحيح لا تحايل: الموافقة **هي** الاستثناء الذي
    // تنص عليه السياسة، وإعادة فحص القفل كانت سترفض ما وافق عليه
    // صاحب الصلاحية للتو.
    const payload = request.payload as UpdateCardInput;
    await this.cards.update(tenant.organizationId, reviewerUserId, request.cardId, payload, {
      bypassPolicy: true,
    });

    await this.finish(tenant, requestId, 'approved', reviewerUserId, note);

    return { status: 'approved' };
  }

  /** يسحب الموظف طلبه قبل البتّ فيه. */
  async withdraw(tenant: TenantContext, actorUserId: string, requestId: string): Promise<void> {
    await withRlsContext(this.prisma, { organizationId: tenant.organizationId }, async (tx) => {
      const updated = await tx.cardChangeRequest.updateMany({
        where: { id: requestId, requestedByUserId: actorUserId, status: 'pending' },
        data: { status: 'withdrawn' },
      });

      if (updated.count === 0) {
        throw new NotFoundException('الطلب غير موجود أو بُتَّ فيه');
      }
    });
  }

  private async finish(
    tenant: TenantContext,
    requestId: string,
    status: ChangeRequestStatus,
    reviewerUserId: string,
    note: string | null,
  ): Promise<void> {
    await withRlsContext(this.prisma, { organizationId: tenant.organizationId }, async (tx) => {
      await tx.cardChangeRequest.update({
        where: { id: requestId },
        data: {
          status,
          reviewedByUserId: reviewerUserId,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId: reviewerUserId,
          action: `change_request.${status}`,
          resourceType: 'card_change_request',
          resourceId: requestId,
          outcome: 'success',
        },
      });

      await tx.outboxEvent.create({
        data: {
          organizationId: tenant.organizationId,
          eventType: OUTBOX_EVENT_TYPES.CHANGE_REQUEST_REVIEWED,
          payload: { requestId, status },
        },
      });
    });
  }

  private async ownerPlacement(
    organizationId: string,
    ownerUserId: string,
  ): Promise<{ departmentId: string | null; branchId: string | null }> {
    const membership = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.organizationMembership.findFirst({
        where: { userId: ownerUserId },
        select: { departmentId: true, branchId: true },
      }),
    );

    return {
      departmentId: membership?.departmentId ?? null,
      branchId: membership?.branchId ?? null,
    };
  }

  private async requesterNames(userIds: string[]): Promise<Map<string, string | null>> {
    if (userIds.length === 0) {
      return new Map();
    }

    // جدول المستخدمين بلا RLS — الأسماء تُقرأ بمعرّفات جاءت من صفوف
    // مقيّدة بالمؤسسة أصلاً، فلا يوسّع هذا الاستعلام ما يُرى.
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: { id: true, fullName: true },
    });

    return new Map(users.map((user) => [user.id, user.fullName]));
  }

  private toSummary(
    row: {
      id: string;
      cardId: string;
      requestedByUserId: string;
      status: string;
      payload: unknown;
      baseRevision: number;
      reviewNote: string | null;
      reviewedAt: Date | null;
      createdAt: Date;
      card: { slug: string; revision: number };
    },
    names: Map<string, string | null>,
  ): ChangeRequestSummary {
    return {
      id: row.id,
      cardId: row.cardId,
      cardSlug: row.card.slug,
      requestedByUserId: row.requestedByUserId,
      requestedByName: names.get(row.requestedByUserId) ?? null,
      status: row.status as ChangeRequestStatus,
      changedFields: changedFieldNames(row.payload as Record<string, unknown>),
      baseRevision: row.baseRevision,
      applicable: row.card.revision === row.baseRevision,
      reviewNote: row.reviewNote,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/**
 * القيم الحالية للحقول التي يطلب التعديل تغييرها.
 *
 * سطحي عمداً: الترجمات تُعاد كاملة لأن المراجع يحتاج مقارنة اللغتين،
 * وبقية الحقول تُنسخ بمفتاحها.
 */
function pickCurrentValues(
  current: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};

  for (const key of Object.keys(payload)) {
    if (key in current) {
      picked[key] = current[key];
    }
  }

  return picked;
}
