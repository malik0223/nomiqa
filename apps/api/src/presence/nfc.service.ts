import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NfcTagStatus, NfcTagSummary } from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import type { NfcTagAssignInput, NfcTagCreateInput, NfcTagRevokeInput } from '@nomiqa/validation';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireOwnCard } from './own-card.js';
import { shareUrl } from './share-code.js';
import { withUniqueShareCode } from './share-code-retry.js';

/**
 * وسوم NFC (خارطة الطريق §10.2).
 *
 * القاعدة الحاكمة لكل ما هنا: **الوسم يُكتب مرة واحدة**. قد يكون
 * مقفلاً بعد الكتابة، وقد يكون في جيب موظف على بعد ألف كيلومتر. فكل
 * عملية إدارية — إعادة توجيه، إبطال، استبدال — يجب أن تتم بتعديل صفٍّ
 * عندنا لا بلمس المعدن.
 *
 * ولذلك لا يحمل الوسم رابط البطاقة إطلاقاً: يحمل كوداً يُترجَم عند كل
 * مسح. الترجمة هي ما نملك تغييره؛ المعدن ليس كذلك.
 */

/** ما تحتاجه البطاقة المرتبطة للعرض في القائمة. */
const CARD_SELECT = {
  slug: true,
  localizations: { select: { fullName: true }, take: 1 },
} as const;

@Injectable()
export class NfcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly config: ConfigService,
  ) {}

  async list(organizationId: string): Promise<NfcTagSummary[]> {
    const tags = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.nfcTag.findMany({
        orderBy: { createdAt: 'desc' },
        include: { card: { select: CARD_SELECT } },
      }),
    );

    return tags.map((tag) => this.toSummary(tag));
  }

  /**
   * يصدر وسماً.
   *
   * البطاقة اختيارية: المؤسسة تشتري وسوماً قبل توزيعها، وربط كل وسم
   * بموظف عند الإصدار كان يعني إعادة إصدار عند كل تسليم — والوسم
   * مطبوع فلا يُعاد إصداره.
   */
  async create(
    organizationId: string,
    actorUserId: string,
    input: NfcTagCreateInput,
  ): Promise<NfcTagSummary> {
    await this.requireFeature(organizationId);

    const tag = await withUniqueShareCode((code) =>
      withRlsContext(this.prisma, { organizationId }, async (tx) => {
        if (input.cardId) {
          await requireOwnCard(tx, input.cardId);
        }

        const created = await tx.nfcTag.create({
          data: {
            organizationId,
            cardId: input.cardId ?? null,
            code,
            label: input.label ?? null,
            status: input.cardId ? 'active' : 'unassigned',
          },
          include: { card: { select: CARD_SELECT } },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId,
            action: 'presence.nfc_tag_issued',
            resourceType: 'nfc_tag',
            resourceId: created.id,
            outcome: 'success',
            // الكود نفسه في السجل عمداً: هو المعرّف الوحيد المطبوع على
            // القطعة، ومن يمسك وسماً في يده لا يملك سواه ليبحث به.
            metadata: { code, assigned: Boolean(input.cardId) },
          },
        });

        return created;
      }),
    );

    return this.toSummary(tag);
  }

  /**
   * يعيد توجيه وسم إلى بطاقة أخرى — أو يفكّه.
   *
   * هذه العملية هي كامل قيمة طبقة الإحالة: موظف غادر وسُلّم وسمه
   * لخلفه، فيتغير صفٌّ واحد ويعمل المعدن نفسه ببطاقة جديدة.
   *
   * الوسم المُبطل لا يقبلها: إعادة تفعيله تعيد وصولاً ظنّ صاحبه أنه
   * أنهاه، والبديل المتاح إصدار وسم جديد.
   */
  async assign(
    organizationId: string,
    actorUserId: string,
    tagId: string,
    input: NfcTagAssignInput,
  ): Promise<NfcTagSummary> {
    await this.requireFeature(organizationId);

    const tag = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const existing = await tx.nfcTag.findFirst({ where: { id: tagId } });

      if (!existing) {
        throw new NotFoundException('الوسم غير موجود');
      }

      if (existing.status === 'revoked') {
        throw new ConflictException('الوسم مُبطل ولا يمكن إعادة تفعيله — أصدر وسماً جديداً');
      }

      if (input.cardId) {
        await requireOwnCard(tx, input.cardId);
      }

      const updated = await tx.nfcTag.update({
        where: { id: tagId },
        data: {
          cardId: input.cardId,
          status: input.cardId ? 'active' : 'unassigned',
          ...(input.label !== undefined ? { label: input.label ?? null } : {}),
        },
        include: { card: { select: CARD_SELECT } },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: input.cardId ? 'presence.nfc_tag_assigned' : 'presence.nfc_tag_unassigned',
          resourceType: 'nfc_tag',
          resourceId: tagId,
          outcome: 'success',
          metadata: {
            code: existing.code,
            previousCardId: existing.cardId,
            cardId: input.cardId,
          },
        },
      });

      return updated;
    });

    return this.toSummary(tag);
  }

  /**
   * يبطل وسماً مفقوداً، ويصدر بديله في العملية نفسها عند الطلب.
   *
   * الاثنان في معاملة واحدة لأنهما قرار واحد: من يبلّغ عن وسم مفقود
   * يريد بديلاً، وإبطالٌ نجح مع إصدارٍ فشل يترك موظفاً بلا وسم ومسؤولاً
   * يظن أنه سلّمه واحداً.
   */
  async revoke(
    organizationId: string,
    actorUserId: string,
    tagId: string,
    input: NfcTagRevokeInput,
  ): Promise<{ revoked: NfcTagSummary; replacement: NfcTagSummary | null }> {
    await this.requireFeature(organizationId);

    const result = await withUniqueShareCode((replacementCode) =>
      withRlsContext(this.prisma, { organizationId }, async (tx) => {
        const existing = await tx.nfcTag.findFirst({ where: { id: tagId } });

        if (!existing) {
          throw new NotFoundException('الوسم غير موجود');
        }

        if (existing.status === 'revoked') {
          throw new ConflictException('الوسم مُبطل مسبقاً');
        }

        const replacement = input.issueReplacement
          ? await tx.nfcTag.create({
              data: {
                organizationId,
                cardId: existing.cardId,
                code: replacementCode,
                label: existing.label,
                status: existing.cardId ? 'active' : 'unassigned',
              },
              include: { card: { select: CARD_SELECT } },
            })
          : null;

        const revoked = await tx.nfcTag.update({
          where: { id: tagId },
          data: {
            status: 'revoked',
            revokedAt: new Date(),
            revokedReason: input.reason,
            revokedByUserId: actorUserId,
            replacedByTagId: replacement?.id ?? null,
            // فكّ الارتباط بالبطاقة: الوسم المُبطل لا يجوز أن يظهر في
            // قائمة وسائل الوصول إلى موظف بعد إبطاله.
            cardId: null,
          },
          include: { card: { select: CARD_SELECT } },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId,
            action: 'presence.nfc_tag_revoked',
            resourceType: 'nfc_tag',
            resourceId: tagId,
            outcome: 'success',
            metadata: {
              code: existing.code,
              reason: input.reason,
              replacementTagId: replacement?.id ?? null,
            },
          },
        });

        return { revoked, replacement };
      }),
    );

    return {
      revoked: this.toSummary(result.revoked),
      replacement: result.replacement ? this.toSummary(result.replacement) : null,
    };
  }

  // ---------------------------------------------------------------
  // داخلي
  // ---------------------------------------------------------------

  private async requireFeature(organizationId: string): Promise<void> {
    if (!(await this.entitlements.hasFeature(organizationId, 'nfc_tags'))) {
      throw new ForbiddenException('وسوم NFC غير متاحة في باقتك الحالية');
    }
  }

  private toSummary(tag: TagRow): NfcTagSummary {
    return {
      id: tag.id,
      code: tag.code,
      label: tag.label,
      status: tag.status as NfcTagStatus,
      cardId: tag.cardId,
      cardSlug: tag.card?.slug ?? null,
      cardOwnerName: tag.card?.localizations[0]?.fullName ?? null,
      writeUrl: shareUrl(this.appBaseUrl(), tag.code),
      scanCount: tag.scanCount,
      lastScanAt: tag.lastScanAt?.toISOString() ?? null,
      revokedAt: tag.revokedAt?.toISOString() ?? null,
      revokedReason: tag.revokedReason,
      createdAt: tag.createdAt.toISOString(),
    };
  }

  private appBaseUrl(): string {
    return this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
  }
}

interface TagRow {
  id: string;
  code: string;
  label: string | null;
  status: string;
  cardId: string | null;
  scanCount: number;
  lastScanAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  createdAt: Date;
  card: { slug: string; localizations: Array<{ fullName: string }> } | null;
}
