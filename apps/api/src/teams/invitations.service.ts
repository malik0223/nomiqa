import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OUTBOX_EVENT_TYPES,
  type AuthenticatedUser,
  type InvitationPreview,
  type InvitationStatus,
  type InvitationSummary,
  type TenantContext,
} from '@nomiqa/contracts';
import { Prisma, withRlsContext, type TenantScopedClient } from '@nomiqa/database';
import type { InviteMemberInput } from '@nomiqa/validation';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertScopeCovers, scopeFilter, withScope } from '../tenancy/scope.js';

/**
 * دعوات الانضمام (خارطة الطريق §9.2).
 *
 * الرمز عشوائي 32 بايت، ويُخزَّن **مجزّأً بـSHA-256 فقط**. لا ملح ولا
 * تمديد مفتاح: هذا ليس كلمة مرور يختارها بشر ويعيد استخدامها، بل قيمة
 * عالية العشوائية لا يُجدي معها القاموس ولا الجداول المحسوبة مسبقاً.
 * الغرض من التجزئة هنا واحد: ألا تُصبح نسخةٌ من الجدول مفاتيحَ انضمام.
 *
 * الرمز الصريح يخرج **مرة واحدة** في استجابة الإنشاء وفي بريد الدعوة،
 * ولا يُقرأ بعدها أبداً — إعادة الإرسال تولّد رمزاً جديداً.
 */

/** صلاحية الدعوة. أسبوعان يكفيان لعودة موظف من إجازة. */
const INVITATION_TTL_DAYS = 14;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(tenant: TenantContext): Promise<InvitationSummary[]> {
    const scope = scopeFilter(tenant, 'members:manage');

    const invitations = await withRlsContext(
      this.prisma,
      { organizationId: tenant.organizationId },
      (tx) =>
        tx.invitation.findMany({
          where: { status: { in: ['pending', 'expired'] }, ...withScope(scope) },
          orderBy: { createdAt: 'desc' },
          include: {
            role: { select: { key: true } },
            // الأسماء تُقرأ بالربط لا باستعلام ثانٍ لكل صف.
          },
        }),
    );

    const unitNames = await this.unitNames(tenant.organizationId, invitations);

    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      roleKey: invitation.role.key,
      status: resolveStatus(invitation.status, invitation.expiresAt),
      departmentName: invitation.departmentId
        ? (unitNames.get(invitation.departmentId) ?? null)
        : null,
      branchName: invitation.branchId ? (unitNames.get(invitation.branchId) ?? null) : null,
      jobTitle: invitation.jobTitle,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    }));
  }

  /**
   * ينشئ دعوة ويعيد رمزها الصريح مرة واحدة.
   *
   * حصة الأعضاء تُحسب بالأعضاء **والدعوات المعلّقة** معاً: عشر دعوات
   * على باقة تسمح بخمسة أعضاء كانت ستُقبل كلها ثم تفشل خمس منها عند
   * القبول — وهو أسوأ وقت لاكتشاف الحد.
   */
  async create(
    tenant: TenantContext,
    actorUserId: string,
    input: InviteMemberInput,
  ): Promise<{ invitationId: string; token: string; expiresAt: Date }> {
    assertScopeCovers(tenant, 'members:manage', {
      departmentId: input.departmentId ?? null,
      branchId: input.branchId ?? null,
    });

    await this.assertSeatAvailable(tenant.organizationId, 1);

    const role = await this.prisma.role.findFirst({
      where: { organizationId: null, key: input.role },
    });

    if (!role) {
      throw new NotFoundException('الدور غير موجود');
    }

    const emailNormalized = input.email.trim().toLowerCase();

    const alreadyMember = await withRlsContext(
      this.prisma,
      { organizationId: tenant.organizationId },
      (tx) =>
        tx.organizationMembership.findFirst({
          where: { user: { email: emailNormalized }, revokedAt: null },
          select: { id: true },
        }),
    );

    if (alreadyMember) {
      throw new ConflictException('هذا الشخص عضو في المؤسسة بالفعل');
    }

    const { token, tokenHash } = generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3_600_000);

    const invitation = await withRlsContext(
      this.prisma,
      { organizationId: tenant.organizationId },
      async (tx) => {
        // دعوة معلّقة سابقة لنفس البريد تُلغى لا تُترك: رمزان صالحان
        // لنفس الشخص يعني أن سحب أحدهما لا يمنع الانضمام.
        await tx.invitation.updateMany({
          where: { emailNormalized, status: 'pending' },
          data: { status: 'revoked', revokedAt: new Date() },
        });

        const created = await tx.invitation.create({
          data: {
            organizationId: tenant.organizationId,
            email: input.email,
            emailNormalized,
            tokenHash,
            roleId: role.id,
            departmentId: input.departmentId ?? null,
            branchId: input.branchId ?? null,
            jobTitle: input.jobTitle ?? null,
            employeeNo: input.employeeNo ?? null,
            locale: input.locale,
            invitedByUserId: actorUserId,
            expiresAt,
          },
        });

        await tx.outboxEvent.create({
          data: {
            organizationId: tenant.organizationId,
            eventType: OUTBOX_EVENT_TYPES.MEMBER_INVITED,
            // الرمز في الحمولة: المرسل يحتاجه لبناء الرابط، والصف
            // يُحذف بعد الإرسال في دورة تنظيف الـoutbox.
            payload: { invitationId: created.id, token, email: input.email, locale: input.locale },
          },
        });

        return created;
      },
    );

    this.logger.log(`أُنشئت دعوة ${invitation.id} في ${tenant.organizationId}`);

    return { invitationId: invitation.id, token, expiresAt };
  }

  /** يلغي دعوة معلّقة. الرمز المُرسَل يصبح بلا قيمة فوراً. */
  async revoke(tenant: TenantContext, actorUserId: string, invitationId: string): Promise<void> {
    const scope = scopeFilter(tenant, 'members:manage');

    await withRlsContext(this.prisma, { organizationId: tenant.organizationId }, async (tx) => {
      const revoked = await tx.invitation.updateMany({
        where: { id: invitationId, status: 'pending', ...withScope(scope) },
        data: { status: 'revoked', revokedAt: new Date() },
      });

      if (revoked.count === 0) {
        throw new NotFoundException('الدعوة غير موجودة أو لم تعد معلّقة');
      }

      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId,
          action: 'invitation.revoked',
          resourceType: 'invitation',
          resourceId: invitationId,
          outcome: 'success',
        },
      });
    });
  }

  /**
   * معاينة الدعوة قبل القبول.
   *
   * تمر بدالة SECURITY DEFINER لأن المدعو ليس عضواً بعد، فسياسة RLS
   * تحجب عنه صف دعوته هو. الدالة تُرجع اسم المؤسسة والدور فحسب.
   */
  async preview(token: string, user: AuthenticatedUser): Promise<InvitationPreview> {
    const invitation = await this.lookup(token);

    const role = await this.prisma.role.findUnique({
      where: { id: invitation.role_id },
      select: { key: true },
    });

    return {
      organizationName: invitation.organization_name,
      roleKey: role?.key ?? 'member',
      jobTitle: invitation.job_title,
      expiresAt: invitation.expires_at.toISOString(),
      emailMatches: user.email.toLowerCase() === invitation.email_normalized,
    };
  }

  /**
   * يقبل دعوة وينشئ العضوية.
   *
   * **يشترط تطابق البريد.** الرمز وحده لا يكفي: رابط دعوة يُعاد توجيهه
   * أو يُنسخ من بريد مشترك كان سيسمح لغير المقصود بالانضمام بصلاحيات
   * أُعدّت لغيره. الرمز يثبت أن حاملَه وصل إلى بريد المدعو، وتطابق
   * الحساب يثبت أنه هو.
   *
   * Idempotent: قبولٌ ثانٍ لدعوة مقبولة يعيد المؤسسة نفسها بلا خطأ —
   * ضغطة مزدوجة على زر لا يجوز أن تُنتج رسالة فشل.
   */
  async accept(
    token: string,
    user: AuthenticatedUser,
  ): Promise<{ organizationId: string; organizationName: string }> {
    const invitation = await this.lookup(token);

    if (invitation.status === 'accepted') {
      return {
        organizationId: invitation.organization_id,
        organizationName: invitation.organization_name,
      };
    }

    if (invitation.status !== 'pending') {
      throw new GoneException('هذه الدعوة لم تعد صالحة');
    }

    if (invitation.expires_at <= new Date()) {
      throw new GoneException('انتهت صلاحية الدعوة — اطلب دعوة جديدة');
    }

    if (user.email.toLowerCase() !== invitation.email_normalized) {
      throw new ForbiddenException('هذه الدعوة أُرسلت إلى بريد آخر');
    }

    const organizationId = invitation.organization_id;

    await this.assertSeatAvailable(organizationId, 0);

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await upsertMembership(tx, {
        organizationId,
        userId: user.id,
        roleId: invitation.role_id,
        departmentId: invitation.department_id,
        branchId: invitation.branch_id,
        jobTitle: invitation.job_title,
        employeeNo: invitation.employee_no,
      });

      await tx.invitation.update({
        where: { id: invitation.invitation_id },
        data: { status: 'accepted', acceptedAt: new Date(), acceptedUserId: user.id },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: user.id,
          action: 'invitation.accepted',
          resourceType: 'invitation',
          resourceId: invitation.invitation_id,
          outcome: 'success',
        },
      });

      await tx.outboxEvent.create({
        data: {
          organizationId,
          eventType: OUTBOX_EVENT_TYPES.INVITATION_ACCEPTED,
          payload: { invitationId: invitation.invitation_id, userId: user.id },
        },
      });
    }).catch(rethrowDuplicateEmployeeNo);

    return { organizationId, organizationName: invitation.organization_name };
  }

  /**
   * يتحقق من كفاية المقاعد.
   *
   * `extra` يسمح بحساب دعوة على وشك الإنشاء ضمن العدد.
   */
  private async assertSeatAvailable(organizationId: string, extra: number): Promise<void> {
    const quota = await this.entitlements.quota(organizationId, 'maxMembers');

    if (quota.limit < 0) {
      return;
    }

    const pendingInvites = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.invitation.count({ where: { status: 'pending', expiresAt: { gt: new Date() } } }),
    );

    if (quota.used + pendingInvites + extra > quota.limit) {
      throw new ForbiddenException(
        `بلغت حد الباقة: ${quota.limit} عضو (بما فيهم ${pendingInvites} دعوة معلّقة). رقِّ الباقة أو ألغِ دعوة.`,
      );
    }
  }

  private async lookup(token: string): Promise<InvitationRow> {
    const tokenHash = hashToken(token);

    const [row] = await this.prisma.$queryRaw<
      InvitationRow[]
    >`SELECT * FROM invitation_by_token(${tokenHash})`;

    if (!row) {
      throw new NotFoundException('الدعوة غير موجودة');
    }

    return row;
  }

  private async unitNames(
    organizationId: string,
    invitations: Array<{ departmentId: string | null; branchId: string | null }>,
  ): Promise<Map<string, string>> {
    const departmentIds = invitations
      .map((invitation) => invitation.departmentId)
      .filter((id): id is string => id !== null);
    const branchIds = invitations
      .map((invitation) => invitation.branchId)
      .filter((id): id is string => id !== null);

    if (departmentIds.length === 0 && branchIds.length === 0) {
      return new Map();
    }

    const { departments, branches } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => ({
        departments: await tx.department.findMany({
          where: { id: { in: departmentIds } },
          select: { id: true, name: true },
        }),
        branches: await tx.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true },
        }),
      }),
    );

    return new Map([...departments, ...branches].map((entry) => [entry.id, entry.name]));
  }
}

/** صف دالة `invitation_by_token`. */
interface InvitationRow {
  invitation_id: string;
  organization_id: string;
  organization_name: string;
  email_normalized: string;
  role_id: string;
  department_id: string | null;
  branch_id: string | null;
  job_title: string | null;
  employee_no: string | null;
  status: string;
  expires_at: Date;
}

/**
 * ينشئ عضوية أو يعيد تفعيل ملغاة.
 *
 * `upsert` لا `create`: موظف غادر وعاد له صف عضوية ملغى، وإنشاء صف
 * ثانٍ يصطدم بالفريد على (المؤسسة، المستخدم) — وهو قيد صحيح لا نريد
 * تخفيفه، فالحل إحياء الصف القائم.
 */
export async function upsertMembership(
  tx: TenantScopedClient,
  input: {
    organizationId: string;
    userId: string;
    roleId: string;
    departmentId: string | null;
    branchId: string | null;
    jobTitle: string | null;
    employeeNo: string | null;
  },
): Promise<string> {
  const membership = await tx.organizationMembership.upsert({
    where: {
      organizationId_userId: { organizationId: input.organizationId, userId: input.userId },
    },
    create: {
      organizationId: input.organizationId,
      userId: input.userId,
      status: 'active',
      joinedAt: new Date(),
      departmentId: input.departmentId,
      branchId: input.branchId,
      jobTitle: input.jobTitle,
      employeeNo: input.employeeNo,
    },
    update: {
      status: 'active',
      revokedAt: null,
      offboardedAt: null,
      joinedAt: new Date(),
      directoryVisible: true,
      departmentId: input.departmentId,
      branchId: input.branchId,
      jobTitle: input.jobTitle,
      employeeNo: input.employeeNo,
    },
  });

  await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
  await tx.membershipRole.create({ data: { membershipId: membership.id, roleId: input.roleId } });

  return membership.id;
}

function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** الدعوة المنتهية تبقى `pending` في العمود حتى تمر عليها دورة تنظيف. */
function resolveStatus(status: string, expiresAt: Date): InvitationStatus {
  if (status === 'pending' && expiresAt <= new Date()) {
    return 'expired';
  }
  return status as InvitationStatus;
}

function rethrowDuplicateEmployeeNo(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new BadRequestException('الرقم الوظيفي في الدعوة مستخدم لعضو آخر');
  }
  throw error;
}
