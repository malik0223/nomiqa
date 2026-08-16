import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BrandKitPayload,
  BrandPolicySummary,
  CustomDomainSummary,
  CustomDomainStatus,
  EffectiveCardPolicy,
  LockableField,
} from '@nomiqa/contracts';
import { Prisma, withRlsContext } from '@nomiqa/database';
import type { BrandKitInput, BrandPolicyInput, CustomDomainInput } from '@nomiqa/validation';
import { randomBytes } from 'node:crypto';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { StorageService } from '../files/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolvePolicy, type PolicyRow } from './card-policy.js';

/**
 * الهوية المؤسسية (خارطة الطريق §9.3).
 *
 * كل ما هنا محكوم بالباقة: `brand_kit` و`locked_fields` و`custom_domain`
 * ميزات مدفوعة. الفحص يقع عند **الكتابة** لا عند القراءة — مؤسسة خُفِّضت
 * باقتها تظل ترى هويتها المحفوظة ولا تستطيع تعديلها، ولا نمحو ألوانها
 * لأن دفعتها تأخرت.
 */

/** بادئة سجل TXT للتحقق من ملكية النطاق. */
export const DOMAIN_CHALLENGE_PREFIX = '_nomiqa-challenge';

/** مدة صلاحية روابط معاينة شعار المؤسسة. */
const LOGO_URL_TTL_SECONDS = 900;

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------
  // الهوية البصرية
  // ---------------------------------------------------------------

  async getBrandKit(organizationId: string): Promise<BrandKitPayload> {
    const [kit, badgeAllowed] = await Promise.all([
      withRlsContext(this.prisma, { organizationId }, (tx) =>
        tx.brandKit.findUnique({ where: { organizationId } }),
      ),
      this.entitlements.hasFeature(organizationId, 'remove_platform_badge'),
    ]);

    return {
      primaryColor: kit?.primaryColor ?? null,
      secondaryColor: kit?.secondaryColor ?? null,
      backgroundColor: kit?.backgroundColor ?? null,
      textColor: kit?.textColor ?? null,
      fontFamily: kit?.fontFamily ?? null,
      logoFileId: kit?.logoFileId ?? null,
      logoUrl: await this.previewUrl(organizationId, kit?.logoFileId ?? null),
      coverFileId: kit?.coverFileId ?? null,
      coverUrl: await this.previewUrl(organizationId, kit?.coverFileId ?? null),
      // القيمة المحفوظة **و**الاستحقاق معاً: الواجهة تعرض المفتاح
      // مطفأً مع سبب بدل إخفائه، فيفهم المسؤول أنها ميزة باقة.
      hidePlatformBadge: kit?.hidePlatformBadge ?? false,
      hidePlatformBadgeAllowed: badgeAllowed,
      updatedAt: kit?.updatedAt.toISOString() ?? null,
    };
  }

  async updateBrandKit(
    organizationId: string,
    actorUserId: string,
    input: BrandKitInput,
  ): Promise<BrandKitPayload> {
    await this.requireFeature(organizationId, 'brand_kit', 'الهوية المؤسسية');

    if (input.hidePlatformBadge === true) {
      await this.requireFeature(
        organizationId,
        'remove_platform_badge',
        'إخفاء شعار المنصة',
      );
    }

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await tx.brandKit.upsert({
        where: { organizationId },
        create: { organizationId, ...toKitData(input), updatedByUserId: actorUserId },
        update: { ...toKitData(input), updatedByUserId: actorUserId },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'branding.kit_updated',
          resourceType: 'brand_kit',
          resourceId: organizationId,
          outcome: 'success',
          metadata: { fields: Object.keys(input) },
        },
      });
    });

    return this.getBrandKit(organizationId);
  }

  // ---------------------------------------------------------------
  // السياسات
  // ---------------------------------------------------------------

  async listPolicies(organizationId: string): Promise<BrandPolicySummary[]> {
    const policies = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.brandPolicy.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          department: { select: { name: true } },
          branch: { select: { name: true } },
        },
      }),
    );

    return policies.map((policy) => ({
      id: policy.id,
      name: policy.name,
      departmentId: policy.departmentId,
      departmentName: policy.department?.name ?? null,
      branchId: policy.branchId,
      branchName: policy.branch?.name ?? null,
      templateKey: policy.templateKey,
      lockedFields: policy.lockedFields as LockableField[],
      requireApproval: policy.requireApproval,
      enforcedValues: (policy.enforcedValues as Record<string, unknown> | null) ?? null,
      isActive: policy.isActive,
    }));
  }

  async createPolicy(
    organizationId: string,
    actorUserId: string,
    input: BrandPolicyInput,
  ): Promise<{ id: string }> {
    await this.requirePolicyFeatures(organizationId, input);

    const created = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const policy = await tx.brandPolicy.create({
        data: {
          organizationId,
          name: input.name,
          departmentId: input.departmentId ?? null,
          branchId: input.branchId ?? null,
          templateKey: input.templateKey ?? null,
          lockedFields: input.lockedFields,
          requireApproval: input.requireApproval,
          enforcedValues: (input.enforcedValues ?? null) as never,
          isActive: input.isActive,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'branding.policy_created',
          resourceType: 'brand_policy',
          resourceId: policy.id,
          outcome: 'success',
          metadata: {
            lockedFields: input.lockedFields,
            requireApproval: input.requireApproval,
          },
        },
      });

      return policy;
    });

    return { id: created.id };
  }

  async updatePolicy(
    organizationId: string,
    actorUserId: string,
    policyId: string,
    input: BrandPolicyInput,
  ): Promise<void> {
    await this.requirePolicyFeatures(organizationId, input);

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const updated = await tx.brandPolicy.updateMany({
        where: { id: policyId },
        data: {
          name: input.name,
          departmentId: input.departmentId ?? null,
          branchId: input.branchId ?? null,
          templateKey: input.templateKey ?? null,
          lockedFields: input.lockedFields,
          requireApproval: input.requireApproval,
          enforcedValues: (input.enforcedValues ?? Prisma.DbNull) as never,
          isActive: input.isActive,
        },
      });

      if (updated.count === 0) {
        throw new NotFoundException('السياسة غير موجودة');
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'branding.policy_updated',
          resourceType: 'brand_policy',
          resourceId: policyId,
          outcome: 'success',
        },
      });
    });
  }

  async deletePolicy(organizationId: string, actorUserId: string, policyId: string): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const deleted = await tx.brandPolicy.deleteMany({ where: { id: policyId } });

      if (deleted.count === 0) {
        throw new NotFoundException('السياسة غير موجودة');
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'branding.policy_deleted',
          resourceType: 'brand_policy',
          resourceId: policyId,
          outcome: 'success',
        },
      });
    });
  }

  /**
   * السياسة السارية على مالك بطاقة بعينه.
   *
   * تُقرأ من موقع **مالك البطاقة** في الهيكل لا من موقع من يعدّلها:
   * السياسة تحمي هوية الإدارة التي تمثّلها البطاقة، ومسؤول يعدّل بطاقة
   * موظف في إدارة أخرى يخضع لسياسة تلك الإدارة.
   */
  async effectivePolicyForOwner(
    organizationId: string,
    ownerUserId: string,
  ): Promise<EffectiveCardPolicy> {
    const { policies, membership } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => ({
        policies: await tx.brandPolicy.findMany({ where: { isActive: true } }),
        membership: await tx.organizationMembership.findFirst({
          where: { userId: ownerUserId },
          select: { departmentId: true, branchId: true },
        }),
      }),
    );

    return resolvePolicy(policies as PolicyRow[], {
      departmentId: membership?.departmentId ?? null,
      branchId: membership?.branchId ?? null,
    });
  }

  // ---------------------------------------------------------------
  // النطاق المخصص
  // ---------------------------------------------------------------

  async listDomains(organizationId: string): Promise<CustomDomainSummary[]> {
    const domains = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.customDomain.findMany({ orderBy: { createdAt: 'desc' } }),
    );

    return domains.map((domain) => ({
      id: domain.id,
      hostname: domain.hostname,
      status: domain.status as CustomDomainStatus,
      verificationRecordName: `${DOMAIN_CHALLENGE_PREFIX}.${domain.hostname}`,
      verificationToken: domain.verificationToken,
      verifiedAt: domain.verifiedAt?.toISOString() ?? null,
      failureReason: domain.failureReason,
    }));
  }

  /**
   * يسجّل نطاقاً مخصصاً بحالة «بانتظار التحقق».
   *
   * الفريد العالمي على `hostname` هو ما يمنع مؤسسةً من حجز نطاق غيرها،
   * والتحقق بسجل TXT هو ما يمنعها من **استخدامه** حتى لو حجزته.
   */
  async addDomain(
    organizationId: string,
    actorUserId: string,
    input: CustomDomainInput,
  ): Promise<CustomDomainSummary> {
    await this.requireFeature(organizationId, 'custom_domain', 'النطاق المخصص');

    const verificationToken = randomBytes(16).toString('hex');

    const created = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const domain = await tx.customDomain.create({
        data: { organizationId, hostname: input.hostname, verificationToken },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'branding.domain_added',
          resourceType: 'custom_domain',
          resourceId: domain.id,
          outcome: 'success',
          metadata: { hostname: input.hostname },
        },
      });

      return domain;
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // نفس الرسالة سواء كان النطاق لنا أو لمؤسسة أخرى: التمييز
        // يكشف أي النطاقات مسجّلة على المنصة.
        throw new ForbiddenException('هذا النطاق غير متاح');
      }
      throw error;
    });

    return {
      id: created.id,
      hostname: created.hostname,
      status: created.status as CustomDomainStatus,
      verificationRecordName: `${DOMAIN_CHALLENGE_PREFIX}.${created.hostname}`,
      verificationToken: created.verificationToken,
      verifiedAt: null,
      failureReason: null,
    };
  }

  async removeDomain(organizationId: string, actorUserId: string, domainId: string): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const deleted = await tx.customDomain.deleteMany({ where: { id: domainId } });

      if (deleted.count === 0) {
        throw new NotFoundException('النطاق غير موجود');
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'branding.domain_removed',
          resourceType: 'custom_domain',
          resourceId: domainId,
          outcome: 'success',
        },
      });
    });
  }

  // ---------------------------------------------------------------
  // داخلي
  // ---------------------------------------------------------------

  private async requirePolicyFeatures(
    organizationId: string,
    input: BrandPolicyInput,
  ): Promise<void> {
    if (input.lockedFields.length > 0) {
      await this.requireFeature(organizationId, 'locked_fields', 'قفل الحقول');
    }
    if (input.requireApproval) {
      await this.requireFeature(organizationId, 'approval_workflow', 'سير الموافقة');
    }
  }

  private async requireFeature(
    organizationId: string,
    feature: Parameters<EntitlementsService['hasFeature']>[1],
    label: string,
  ): Promise<void> {
    if (!(await this.entitlements.hasFeature(organizationId, feature))) {
      throw new ForbiddenException(`${label} غير متاح في باقتك الحالية`);
    }
  }

  /** رابط معاينة قصير العمر — الملفات لا تُقدَّم عبر التطبيق (القاعدة 2). */
  private async previewUrl(organizationId: string, fileId: string | null): Promise<string | null> {
    if (!fileId) {
      return null;
    }

    const file = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.fileObject.findFirst({ where: { id: fileId }, select: { storageKey: true } }),
    );

    if (!file) {
      return null;
    }

    return this.storage.createDownloadUrl(file.storageKey, LOGO_URL_TTL_SECONDS);
  }
}

function toKitData(input: BrandKitInput) {
  return {
    ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
    ...(input.secondaryColor !== undefined ? { secondaryColor: input.secondaryColor } : {}),
    ...(input.backgroundColor !== undefined ? { backgroundColor: input.backgroundColor } : {}),
    ...(input.textColor !== undefined ? { textColor: input.textColor } : {}),
    ...(input.fontFamily !== undefined ? { fontFamily: input.fontFamily } : {}),
    ...(input.logoFileId !== undefined ? { logoFileId: input.logoFileId } : {}),
    ...(input.coverFileId !== undefined ? { coverFileId: input.coverFileId } : {}),
    ...(input.hidePlatformBadge !== undefined
      ? { hidePlatformBadge: input.hidePlatformBadge }
      : {}),
  };
}
