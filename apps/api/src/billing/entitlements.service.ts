import { Injectable, Logger } from '@nestjs/common';
import type {
  OrganizationEntitlements,
  PlanFeature,
  PlanLimits,
  SubscriptionStatus,
} from '@nomiqa/contracts';
import { withRlsContext, type TenantScopedClient } from '@nomiqa/database';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * الحصص والميزات السارية على مؤسسة.
 *
 * **النقطة الوحيدة التي تُقرأ منها الباقة** — كما نصّت
 * `docs/cards/publishing.md §8` منذ المرحلة الثانية. كل حدّ في المنصة
 * يمر من هنا، ولا شرط باقة متناثر في خدمة أخرى.
 *
 * القاعدة الحاكمة عند غياب الاشتراك: الباقة المجانية. مؤسسة بلا صف
 * اشتراك، أو باشتراك منتهٍ، أو بباقة حُذفت من الكتالوج — كلها تسقط إلى
 * المجانية لا إلى «بلا حدود». الفشل المفتوح في محرك حصص يعني خدمة
 * مدفوعة تُقدَّم مجاناً بلا أن يلاحظ أحد.
 */

/**
 * حدود احتياطية حين يتعذّر قراءة الكتالوج.
 *
 * قاعدة البيانات مصدر الحقيقة للباقات، لكن استعلاماً فاشلاً لا يجوز أن
 * يفتح الحدود ولا أن يمنع صاحب الباقة المدفوعة من العمل — فنسقط إلى
 * أضيق حالة معروفة ونسجّل الخطأ.
 */
export const FALLBACK_FREE_LIMITS: PlanLimits = {
  maxCards: 1,
  maxMembers: 1,
  maxDepartments: 0,
  maxBranches: 0,
  maxContacts: 100,
};

/** الحالات التي تُعتبر فيها الباقة المدفوعة سارية. */
const ENTITLED_STATUSES = new Set<SubscriptionStatus>(['trialing', 'active', 'past_due']);

export interface ResolvedPlan {
  planKey: string;
  planName: string;
  status: SubscriptionStatus;
  limits: PlanLimits;
  features: PlanFeature[];
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  inGracePeriod: boolean;
}

@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger(EntitlementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * الباقة السارية.
   *
   * `past_due` تبقى مستحِقّة عمداً: فشل تحصيل واحد لا يجوز أن يطفئ
   * بطاقات منشورة مطبوعة على ورق في اللحظة نفسها. الخفض يقع بعد مهلة
   * السماح، ويتولاه الـWorker لا مسار قراءة.
   */
  async resolvePlan(organizationId: string): Promise<ResolvedPlan> {
    const subscription = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.subscription.findUnique({
        where: { organizationId },
        include: { plan: true },
      }),
    );

    if (!subscription || !ENTITLED_STATUSES.has(subscription.status as SubscriptionStatus)) {
      return this.freePlan(subscription?.status as SubscriptionStatus | undefined);
    }

    if (!subscription.plan.isActive) {
      // باقة عُطّلت من الكتالوج والمؤسسة ما زالت عليها: نُبقي حدودها
      // حتى نهاية الفترة المدفوعة بدل قطع خدمة دُفع ثمنها.
      this.logger.warn(`المؤسسة ${organizationId} على باقة معطّلة ${subscription.plan.key}`);
    }

    return {
      planKey: subscription.plan.key,
      planName: subscription.plan.name,
      status: subscription.status as SubscriptionStatus,
      limits: parseLimits(subscription.plan.limits),
      features: subscription.plan.features as PlanFeature[],
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      inGracePeriod:
        subscription.status === 'past_due' && subscription.gracePeriodEndsAt !== null,
    };
  }

  /** الباقة والحدود والاستخدام معاً — ما تحتاجه شاشة الفوترة كاملاً. */
  async describe(organizationId: string): Promise<OrganizationEntitlements> {
    const [plan, usage] = await Promise.all([
      this.resolvePlan(organizationId),
      this.usage(organizationId),
    ]);

    return {
      planKey: plan.planKey,
      planName: plan.planName,
      status: plan.status,
      limits: plan.limits,
      features: plan.features,
      usage,
      trialEndsAt: plan.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: plan.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: plan.cancelAtPeriodEnd,
      inGracePeriod: plan.inGracePeriod,
    };
  }

  /**
   * الاستخدام الحالي.
   *
   * العدّ في معاملة واحدة: أربعة استعلامات متفرقة كانت ستُنتج لقطة
   * غير متسقة حين يُنشئ عضو بطاقةً بين استعلامين.
   */
  async usage(organizationId: string): Promise<OrganizationEntitlements['usage']> {
    return withRlsContext(this.prisma, { organizationId }, async (tx) => ({
      cards: await tx.card.count({ where: { deletedAt: null } }),
      members: await countActiveMembers(tx),
      departments: await tx.department.count(),
      branches: await tx.branch.count(),
      contacts: await tx.contact.count({ where: { deletedAt: null } }),
    }));
  }

  /** هل الميزة مشمولة بالباقة الحالية؟ */
  async hasFeature(organizationId: string, feature: PlanFeature): Promise<boolean> {
    const plan = await this.resolvePlan(organizationId);
    return plan.features.includes(feature);
  }

  /**
   * الحدّ المتبقي لمورد.
   *
   * `remaining` قد يكون سالباً بعد خفض الباقة: مؤسسة عليها عشر بطاقات
   * نزلت إلى باقة تسمح بخمس. لا نحذف شيئاً — نمنع الإضافة فقط، وتظهر
   * القيمة السالبة في الواجهة كتحذير صريح.
   */
  async quota(
    organizationId: string,
    resource: keyof PlanLimits,
  ): Promise<{ limit: number; used: number; remaining: number; canAdd: boolean }> {
    const [plan, usage] = await Promise.all([
      this.resolvePlan(organizationId),
      this.usage(organizationId),
    ]);

    const limit = plan.limits[resource];
    const used = usage[USAGE_KEY_BY_LIMIT[resource]];

    if (limit < 0) {
      return { limit, used, remaining: Number.POSITIVE_INFINITY, canAdd: true };
    }

    return { limit, used, remaining: limit - used, canAdd: used < limit };
  }

  private async freePlan(currentStatus?: SubscriptionStatus): Promise<ResolvedPlan> {
    const free = await this.prisma.plan
      .findUnique({ where: { key: 'free' } })
      .catch((error: Error) => {
        this.logger.error(`تعذّر قراءة الباقة المجانية: ${error.message}`);
        return null;
      });

    return {
      planKey: 'free',
      planName: free?.name ?? 'المجانية',
      status: currentStatus ?? 'expired',
      limits: free ? parseLimits(free.limits) : FALLBACK_FREE_LIMITS,
      features: (free?.features ?? []) as PlanFeature[],
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      inGracePeriod: false,
    };
  }
}

/** الأعضاء النشطون — أساس التسعير بالمقاعد (§9.4). */
async function countActiveMembers(tx: TenantScopedClient): Promise<number> {
  return tx.organizationMembership.count({ where: { status: 'active', revokedAt: null } });
}

const USAGE_KEY_BY_LIMIT: Record<keyof PlanLimits, keyof OrganizationEntitlements['usage']> = {
  maxCards: 'cards',
  maxMembers: 'members',
  maxDepartments: 'departments',
  maxBranches: 'branches',
  maxContacts: 'contacts',
};

/**
 * يقرأ عمود الحدود JSON.
 *
 * كل مفتاح غائب يسقط إلى القيمة المجانية لا إلى «بلا حد»: باقة أُضيفت
 * من اللوحة ونُسي فيها `maxBranches` يجب أن تمنع الفروع لا أن تفتحها.
 */
export function parseLimits(raw: unknown): PlanLimits {
  const source = (raw ?? {}) as Partial<Record<keyof PlanLimits, unknown>>;

  const read = (key: keyof PlanLimits): number => {
    const value = source[key];
    return typeof value === 'number' && Number.isInteger(value)
      ? value
      : FALLBACK_FREE_LIMITS[key];
  };

  return {
    maxCards: read('maxCards'),
    maxMembers: read('maxMembers'),
    maxDepartments: read('maxDepartments'),
    maxBranches: read('maxBranches'),
    maxContacts: read('maxContacts'),
  };
}
