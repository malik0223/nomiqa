import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OUTBOX_EVENT_TYPES,
  type BillingInterval,
  type CheckoutResult,
  type CouponSummary,
  type PlanChangePreview,
  type PlanFeature,
  type PlanSummary,
  type SubscriptionStatus,
  type SubscriptionSummary,
} from '@nomiqa/contracts';
import { withRlsContext, type TenantScopedClient } from '@nomiqa/database';
import type { StartSubscriptionInput } from '@nomiqa/validation';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementsService, parseLimits } from './entitlements.service.js';
import { InvoicesService } from './invoices.service.js';
import { addInterval, computeDiscount, unusedCredit, type CouponInput } from './pricing.js';

/**
 * دورة حياة الاشتراك (خارطة الطريق §9.4).
 *
 * ثلاث قواعد تحكم كل ما هنا:
 *
 *   1. **لا ترقية قبل الدفع.** الباقة الحالية لا تُلمس حتى تُسدَّد
 *      فاتورة التغيير؛ الباقة المقصودة تُحفظ على سطر الفاتورة وتُطبَّق
 *      عند التحصيل. جلسة دفع مهجورة تترك العميل على باقته لا على
 *      باقة لم يدفع ثمنها.
 *   2. **لا خفض يحذف بيانات.** الخفض يمنع الإضافة ولا يمسّ ما وُجد؛
 *      البطاقات فوق الحد تبقى وتظهر كتجاوز في الواجهة.
 *   3. **الفترة المدفوعة حق مكتسب.** الإلغاء يسري بنهايتها افتراضياً،
 *      والإلغاء الفوري خيار صريح.
 */

/** مهلة السماح بعد فشل التحصيل قبل الخفض إلى المجانية. */
export const GRACE_PERIOD_DAYS = 7;

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly invoices: InvoicesService,
  ) {}

  // ---------------------------------------------------------------
  // قراءة
  // ---------------------------------------------------------------

  /** كتالوج الباقات المعروضة. مشترك بين المؤسسات فلا يحتاج سياق RLS. */
  async listPlans(includePrivate = false): Promise<PlanSummary[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true, ...(includePrivate ? {} : { isPublic: true }) },
      orderBy: { sortOrder: 'asc' },
      include: { prices: { where: { isActive: true } } },
    });

    return plans.map((plan) => ({
      id: plan.id,
      key: plan.key,
      name: plan.name,
      nameEn: plan.nameEn,
      description: plan.description,
      descriptionEn: plan.descriptionEn,
      limits: parseLimits(plan.limits),
      features: plan.features as PlanFeature[],
      trialDays: plan.trialDays,
      isPublic: plan.isPublic,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      prices: plan.prices.map((price) => ({
        id: price.id,
        interval: price.interval as BillingInterval,
        currency: price.currency,
        amountBaisa: price.amountBaisa,
      })),
    }));
  }

  async get(organizationId: string): Promise<SubscriptionSummary | null> {
    const subscription = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.subscription.findUnique({
        where: { organizationId },
        include: { plan: true, price: true, coupon: true },
      }),
    );

    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      planKey: subscription.plan.key,
      planName: subscription.plan.name,
      status: subscription.status as SubscriptionStatus,
      interval: (subscription.price?.interval as BillingInterval) ?? null,
      quantity: subscription.quantity,
      amountBaisa: subscription.price?.amountBaisa ?? null,
      currency: subscription.price?.currency ?? 'OMR',
      currentPeriodStart: subscription.currentPeriodStart.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt?.toISOString() ?? null,
      gracePeriodEndsAt: subscription.gracePeriodEndsAt?.toISOString() ?? null,
      couponCode: subscription.coupon?.code ?? null,
    };
  }

  /**
   * معاينة تغيير الباقة قبل تأكيده.
   *
   * الموانع تُعرض **قبل** الدفع لا بعده: عميل يخفض باقته ولديه عشرون
   * بطاقة يجب أن يعرف أنه سيتجاوز الحد قبل أن يدفع، لا أن يكتشفه في
   * أول محاولة إنشاء.
   */
  async previewChange(
    organizationId: string,
    input: StartSubscriptionInput,
  ): Promise<PlanChangePreview> {
    const target = await this.requirePlan(input.planKey);
    const current = await this.entitlements.resolvePlan(organizationId);
    const usage = await this.entitlements.usage(organizationId);
    const targetLimits = parseLimits(target.limits);

    const blockers: PlanChangePreview['blockers'] = [];
    const check = (code: string, used: number, allowed: number): void => {
      if (allowed >= 0 && used > allowed) {
        blockers.push({ code, current: used, allowed });
      }
    };

    check('cards', usage.cards, targetLimits.maxCards);
    check('members', usage.members, targetLimits.maxMembers);
    check('departments', usage.departments, targetLimits.maxDepartments);
    check('branches', usage.branches, targetLimits.maxBranches);
    check('contacts', usage.contacts, targetLimits.maxContacts);

    const targetFeatures = target.features as PlanFeature[];
    const lostFeatures = current.features.filter((feature) => !targetFeatures.includes(feature));

    const { amountDueBaisa, vatBaisa, totalBaisa, currency } = await this.quoteChange(
      organizationId,
      input,
    );

    return {
      fromPlanKey: current.planKey,
      toPlanKey: target.key,
      direction: comparePlans(current.planKey, target.key),
      amountDueBaisa,
      vatBaisa,
      totalBaisa,
      currency,
      effectiveAt: new Date().toISOString(),
      blockers,
      lostFeatures,
    };
  }

  /** يتحقق من كود خصم ويحسب أثره على مبلغ بعينه. */
  async validateCoupon(
    organizationId: string,
    code: string,
    planKey: string,
    subtotalBaisa: number,
  ): Promise<CouponSummary> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });

    const now = new Date();
    const unusable =
      !coupon ||
      !coupon.isActive ||
      coupon.validFrom > now ||
      (coupon.validUntil !== null && coupon.validUntil < now) ||
      (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) ||
      (coupon.appliesToPlanKeys.length > 0 && !coupon.appliesToPlanKeys.includes(planKey));

    if (unusable) {
      // رسالة واحدة لكل أسباب الرفض: التمييز بينها يحوّل الحقل إلى
      // أداة استكشاف لأكواد الخصم النشطة.
      throw new BadRequestException('كود الخصم غير صالح');
    }

    const alreadyUsed = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.couponRedemption.findFirst({ where: { couponId: coupon.id } }),
    );

    if (alreadyUsed) {
      throw new ConflictException('استُخدم هذا الكود من قبل');
    }

    return {
      code: coupon.code,
      name: coupon.name,
      discountType: coupon.discountType as 'percent' | 'fixed',
      discountValue: coupon.discountValue,
      durationCycles: coupon.durationCycles,
      discountBaisa: computeDiscount(subtotalBaisa, {
        discountType: coupon.discountType as 'percent' | 'fixed',
        discountValue: coupon.discountValue,
      }),
    };
  }

  // ---------------------------------------------------------------
  // تغيير الباقة
  // ---------------------------------------------------------------

  /**
   * يبدأ اشتراكاً أو يغيّر باقة.
   *
   * ثلاثة مخارج:
   *   - الباقة المجانية → خفض فوري بلا فاتورة.
   *   - تجربة مستحقة أو مبلغ صفري → تفعيل فوري.
   *   - غير ذلك → فاتورة ورابط دفع، والتطبيق عند التحصيل.
   */
  async checkout(
    organizationId: string,
    actorUserId: string,
    input: StartSubscriptionInput,
  ): Promise<CheckoutResult> {
    const plan = await this.requirePlan(input.planKey);
    const preview = await this.previewChange(organizationId, input);

    if (preview.blockers.length > 0) {
      const detail = preview.blockers
        .map((blocker) => `${blocker.code}: ${blocker.current}/${blocker.allowed}`)
        .join('، ');
      throw new ConflictException(
        `الباقة المطلوبة لا تتسع لاستخدامك الحالي (${detail}). احذف ما يزيد أولاً.`,
      );
    }

    if (plan.key === 'free') {
      await this.downgradeToFree(organizationId, actorUserId, 'user_request');
      return { outcome: 'activated', checkoutUrl: null, invoiceId: null, paymentId: null };
    }

    const price = await this.requirePrice(plan.id, input.interval);

    const members = (await this.entitlements.usage(organizationId)).members;
    if (input.quantity < members) {
      throw new BadRequestException(
        `عدد المقاعد (${input.quantity}) أقل من الأعضاء النشطين (${members}).`,
      );
    }

    const existing = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.subscription.findUnique({ where: { organizationId } }),
    );

    // التجربة تُمنح مرة واحدة: وجود أي اشتراك سابق — ولو ملغى — يعني
    // أن المؤسسة جرّبت، وإلا صار الإلغاء وإعادة الاشتراك تجربةً دائمة.
    const trialEligible = !existing && plan.trialDays > 0;

    if (trialEligible) {
      await this.startTrial(organizationId, actorUserId, plan.id, price.id, input.quantity, plan.trialDays);
      return { outcome: 'activated', checkoutUrl: null, invoiceId: null, paymentId: null };
    }

    const quote = await this.quoteChange(organizationId, input);

    const { invoiceId, totalBaisa } = await this.invoices.issue({
      organizationId,
      subscriptionId: existing?.id ?? null,
      lines: [
        {
          description: `اشتراك ${plan.name} — ${input.interval === 'year' ? 'سنوي' : 'شهري'}`,
          descriptionEn: `${plan.nameEn ?? plan.key} subscription — ${input.interval}ly`,
          quantity: input.quantity,
          unitAmountBaisa: quote.unitAmountBaisa,
          // الباقة المقصودة تسافر مع الفاتورة: التحصيل قد يقع بعد
          // ساعات في مسار لا يعرف ما طُلب، وهذه هي نيّة العميل الموثّقة.
          metadata: {
            planId: plan.id,
            priceId: price.id,
            interval: input.interval,
            quantity: input.quantity,
            couponCode: input.couponCode ?? null,
          },
        },
      ],
      coupon: quote.coupon,
      periodStart: null,
      periodEnd: null,
    });

    if (totalBaisa === 0) {
      // خصم بلغ 100% أو رصيد غطّى الفرق: لا شيء لتحصيله، فنطبّق فوراً.
      await this.applyPaidInvoice(organizationId, invoiceId);
      return { outcome: 'activated', checkoutUrl: null, invoiceId, paymentId: null };
    }

    const session = await this.invoices.createCheckout(organizationId, invoiceId);

    return {
      outcome: 'redirect',
      checkoutUrl: session.checkoutUrl,
      invoiceId,
      paymentId: session.paymentId,
    };
  }

  /**
   * يطبّق أثر فاتورة مسددة على الاشتراك.
   *
   * Idempotent: يقرأ نيّة الفاتورة ويكتب الحالة النهائية، فتشغيله مرتين
   * يُنتج الحالة نفسها. يُستدعى من مسار تأكيد الدفع ومن الـWorker معاً.
   */
  async applyPaidInvoice(organizationId: string, invoiceId: string): Promise<void> {
    const invoice = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.invoice.findFirst({ where: { id: invoiceId }, include: { lines: true } }),
    );

    if (!invoice || invoice.status !== 'paid') {
      return;
    }

    const intent = invoice.lines
      .map((line) => line.metadata as SubscriptionIntent | null)
      .find((metadata) => metadata?.planId);

    if (!intent) {
      // فاتورة بلا نيّة اشتراك (تسوية يدوية مثلاً) — لا أثر على الباقة.
      return;
    }

    const now = new Date();
    const periodEnd = addInterval(now, intent.interval);

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { organizationId } });

      const subscription = await tx.subscription.upsert({
        where: { organizationId },
        create: {
          organizationId,
          planId: intent.planId,
          priceId: intent.priceId,
          status: 'active',
          quantity: intent.quantity,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        update: {
          planId: intent.planId,
          priceId: intent.priceId,
          status: 'active',
          quantity: intent.quantity,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          // التسديد يُنهي مهلة السماح ويلغي أي إلغاء مجدول: العميل دفع.
          gracePeriodEndsAt: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          subscriptionId: subscription.id,
          periodStart: now,
          periodEnd,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          organizationId,
          subscriptionId: subscription.id,
          type: existing ? 'renewed' : 'activated',
          fromPlanId: existing?.planId ?? null,
          toPlanId: intent.planId,
          metadata: { invoiceId },
        },
      });

      await tx.outboxEvent.create({
        data: {
          organizationId,
          eventType: OUTBOX_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
          payload: { subscriptionId: subscription.id, planId: intent.planId, invoiceId },
        },
      });

      if (intent.couponCode) {
        await this.redeemCoupon(tx, organizationId, intent.couponCode, subscription.id, invoiceId);
      }
    });

    this.logger.log(`فُعِّل اشتراك المؤسسة ${organizationId} على الباقة ${intent.planId}`);
  }

  /**
   * إلغاء الاشتراك.
   *
   * الافتراضي «بنهاية الفترة»: زرٌّ واحد لا يجوز أن يمحو خدمةً دُفع
   * ثمنها. الإلغاء الفوري متاح لمن يطلبه صراحةً — ولا يردّ مالاً
   * تلقائياً، فالاسترداد قرار بشري بسياسة مكتوبة.
   */
  async cancel(
    organizationId: string,
    actorUserId: string,
    immediate: boolean,
    reason: string | null,
  ): Promise<SubscriptionSummary> {
    const subscription = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.subscription.findUnique({ where: { organizationId } }),
    );

    if (!subscription || subscription.status === 'canceled') {
      throw new NotFoundException('لا يوجد اشتراك نشط');
    }

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: immediate
          ? {
              status: 'canceled',
              canceledAt: new Date(),
              cancelAtPeriodEnd: false,
              currentPeriodEnd: new Date(),
            }
          : { cancelAtPeriodEnd: true, canceledAt: new Date() },
      });

      await tx.subscriptionEvent.create({
        data: {
          organizationId,
          subscriptionId: subscription.id,
          type: 'canceled',
          fromPlanId: subscription.planId,
          actorUserId,
          metadata: { immediate, reason },
        },
      });

      await tx.outboxEvent.create({
        data: {
          organizationId,
          eventType: OUTBOX_EVENT_TYPES.SUBSCRIPTION_CANCELED,
          payload: { subscriptionId: subscription.id, immediate },
        },
      });
    });

    if (immediate) {
      await this.downgradeToFree(organizationId, actorUserId, 'immediate_cancel');
    }

    return (await this.get(organizationId)) as SubscriptionSummary;
  }

  /** يتراجع عن إلغاء مجدول ما دامت الفترة سارية. */
  async resume(organizationId: string, actorUserId: string): Promise<SubscriptionSummary> {
    const subscription = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.subscription.findUnique({ where: { organizationId } }),
    );

    if (!subscription || !subscription.cancelAtPeriodEnd) {
      throw new NotFoundException('لا يوجد إلغاء مجدول');
    }

    if (subscription.currentPeriodEnd <= new Date()) {
      throw new ConflictException('انتهت الفترة — ابدأ اشتراكاً جديداً');
    }

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: false, canceledAt: null },
      });

      await tx.subscriptionEvent.create({
        data: {
          organizationId,
          subscriptionId: subscription.id,
          type: 'reactivated',
          actorUserId,
        },
      });
    });

    return (await this.get(organizationId)) as SubscriptionSummary;
  }

  // ---------------------------------------------------------------
  // دورة التجديد — تُستدعى من الـWorker
  // ---------------------------------------------------------------

  /**
   * يجهّز فاتورة الفترة التالية.
   *
   * Idempotent بفحص وجود فاتورة للفترة نفسها: الدورة تعمل يومياً وقد
   * تمر على الاشتراك نفسه سبع مرات قبل استحقاقه.
   */
  async prepareRenewal(
    organizationId: string,
    subscriptionId: string,
  ): Promise<{ invoiceId: string; checkoutUrl: string } | null> {
    const subscription = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.subscription.findFirst({
        where: { id: subscriptionId },
        include: { plan: true, price: true },
      }),
    );

    if (!subscription || !subscription.price) {
      return null;
    }

    if (subscription.cancelAtPeriodEnd || subscription.status === 'canceled') {
      return null;
    }

    const periodStart = subscription.currentPeriodEnd;
    const periodEnd = addInterval(periodStart, subscription.price.interval as BillingInterval);

    const alreadyIssued = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.invoice.findFirst({
        where: {
          subscriptionId: subscription.id,
          periodStart,
          status: { in: ['open', 'paid'] },
        },
      }),
    );

    if (alreadyIssued) {
      return null;
    }

    const { invoiceId, totalBaisa } = await this.invoices.issue({
      organizationId,
      subscriptionId: subscription.id,
      lines: [
        {
          description: `تجديد ${subscription.plan.name}`,
          descriptionEn: `${subscription.plan.nameEn ?? subscription.plan.key} renewal`,
          quantity: subscription.quantity,
          unitAmountBaisa: subscription.price.amountBaisa,
          metadata: {
            planId: subscription.planId,
            priceId: subscription.price.id,
            interval: subscription.price.interval,
            quantity: subscription.quantity,
            couponCode: null,
          },
        },
      ],
      coupon: null,
      periodStart,
      periodEnd,
    });

    if (totalBaisa === 0) {
      await this.applyPaidInvoice(organizationId, invoiceId);
      return null;
    }

    const session = await this.invoices.createCheckout(organizationId, invoiceId);

    // الفترة انتهت والفاتورة لم تُسدَّد: تبدأ مهلة السماح ولا تتوقف
    // الخدمة. القطع الفوري عند أول فشل تحصيل يطفئ بطاقات مطبوعة.
    if (subscription.currentPeriodEnd <= new Date()) {
      await this.enterGracePeriod(organizationId, subscription.id);
    }

    return { invoiceId, checkoutUrl: session.checkoutUrl };
  }

  /** ينهي مهلة السماح: خفض إلى المجانية بعد استنفادها. */
  async expireOverdue(organizationId: string, subscriptionId: string): Promise<void> {
    const subscription = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.subscription.findFirst({ where: { id: subscriptionId } }),
    );

    if (!subscription || subscription.status !== 'past_due') {
      return;
    }

    if (subscription.gracePeriodEndsAt && subscription.gracePeriodEndsAt > new Date()) {
      return;
    }

    await this.downgradeToFree(organizationId, null, 'grace_period_expired');
  }

  // ---------------------------------------------------------------
  // داخلي
  // ---------------------------------------------------------------

  private async startTrial(
    organizationId: string,
    actorUserId: string,
    planId: string,
    priceId: string,
    quantity: number,
    trialDays: number,
  ): Promise<void> {
    const now = new Date();
    const trialEnd = new Date(now.getTime() + trialDays * 24 * 3_600_000);

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          organizationId,
          planId,
          priceId,
          status: 'trialing',
          quantity,
          currentPeriodStart: now,
          // الفترة تنتهي بانتهاء التجربة: عندها تُصدَر أول فاتورة.
          currentPeriodEnd: trialEnd,
          trialEndsAt: trialEnd,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          organizationId,
          subscriptionId: subscription.id,
          type: 'trial_started',
          toPlanId: planId,
          actorUserId,
          metadata: { trialDays },
        },
      });
    });
  }

  private async enterGracePeriod(organizationId: string, subscriptionId: string): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await tx.subscription.updateMany({
        where: { id: subscriptionId, status: { in: ['active', 'trialing'] } },
        data: {
          status: 'past_due',
          gracePeriodEndsAt: new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 3_600_000),
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          organizationId,
          subscriptionId,
          type: 'payment_failed',
          metadata: { graceDays: GRACE_PERIOD_DAYS },
        },
      });

      await tx.outboxEvent.create({
        data: {
          organizationId,
          eventType: OUTBOX_EVENT_TYPES.PAYMENT_FAILED,
          payload: { subscriptionId, graceDays: GRACE_PERIOD_DAYS },
        },
      });
    });
  }

  /**
   * يُنزل المؤسسة إلى المجانية.
   *
   * لا يحذف شيئاً: لا بطاقة ولا عضواً ولا جهة اتصال. الحدود تمنع
   * الإضافة، والموجود يبقى ويظهر كتجاوز. حذف بيانات عميل لأن دفعته
   * تأخرت خسارةٌ لا يمكن التراجع عنها مقابل مبلغ قد يصل غداً.
   */
  private async downgradeToFree(
    organizationId: string,
    actorUserId: string | null,
    reason: string,
  ): Promise<void> {
    const free = await this.prisma.plan.findUnique({ where: { key: 'free' } });
    if (!free) {
      throw new NotFoundException('الباقة المجانية غير موجودة — شغّل pnpm db:seed');
    }

    const now = new Date();

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { organizationId } });

      const subscription = await tx.subscription.upsert({
        where: { organizationId },
        create: {
          organizationId,
          planId: free.id,
          status: 'active',
          quantity: 1,
          currentPeriodStart: now,
          // الباقة المجانية بلا تجديد: فترة بعيدة تمنع دخولها دورة
          // التجديد بلا داعٍ.
          currentPeriodEnd: new Date('2999-12-31T00:00:00Z'),
        },
        update: {
          planId: free.id,
          priceId: null,
          status: 'active',
          quantity: 1,
          currentPeriodStart: now,
          currentPeriodEnd: new Date('2999-12-31T00:00:00Z'),
          cancelAtPeriodEnd: false,
          gracePeriodEndsAt: null,
          couponId: null,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          organizationId,
          subscriptionId: subscription.id,
          type: 'downgraded',
          fromPlanId: existing?.planId ?? null,
          toPlanId: free.id,
          actorUserId,
          metadata: { reason },
        },
      });
    });

    this.logger.log(`خُفِّضت المؤسسة ${organizationId} إلى المجانية (${reason})`);
  }

  /**
   * يحسب المستحق عند تغيير الباقة.
   *
   * رصيد ما تبقى من الفترة الحالية يُخصم من المبلغ الجديد: عميل رقّى
   * باقته بعد يومين من دفع شهر كامل لا يجوز أن يدفع الشهر مرتين.
   * الرصيد لا يُردّ نقداً ولا يتجاوز المستحق الجديد.
   */
  private async quoteChange(
    organizationId: string,
    input: StartSubscriptionInput,
  ): Promise<{
    unitAmountBaisa: number;
    amountDueBaisa: number;
    vatBaisa: number;
    totalBaisa: number;
    currency: string;
    coupon: CouponInput | null;
  }> {
    const plan = await this.requirePlan(input.planKey);

    if (plan.key === 'free') {
      return {
        unitAmountBaisa: 0,
        amountDueBaisa: 0,
        vatBaisa: 0,
        totalBaisa: 0,
        currency: 'OMR',
        coupon: null,
      };
    }

    const price = await this.requirePrice(plan.id, input.interval);

    const current = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.subscription.findUnique({ where: { organizationId }, include: { price: true } }),
    );

    let credit = 0;
    if (current?.price && current.status === 'active') {
      credit = unusedCredit(
        current.price.amountBaisa * current.quantity,
        current.currentPeriodStart,
        current.currentPeriodEnd,
        new Date(),
      );
    }

    const gross = price.amountBaisa * input.quantity;
    // الرصيد يُطرح من سعر الوحدة لا من المجموع: سطر الفاتورة يحمل
    // الكمية، ولو طُرح من المجموع لظهر سطر بسعر لا يطابق حاصل الضرب.
    const netTotal = Math.max(0, gross - credit);
    const unitAmountBaisa = Math.round(netTotal / input.quantity);
    const subtotal = unitAmountBaisa * input.quantity;

    let coupon: CouponInput | null = null;
    if (input.couponCode) {
      const validated = await this.validateCoupon(
        organizationId,
        input.couponCode,
        plan.key,
        subtotal,
      );
      coupon = { discountType: validated.discountType, discountValue: validated.discountValue };
    }

    const discount = computeDiscount(subtotal, coupon);
    const taxable = subtotal - discount;
    const vatBaisa = Math.round((taxable * 500) / 10_000);

    return {
      unitAmountBaisa,
      amountDueBaisa: taxable,
      vatBaisa,
      totalBaisa: taxable + vatBaisa,
      currency: price.currency,
      coupon,
    };
  }

  private async redeemCoupon(
    tx: TenantScopedClient,
    organizationId: string,
    code: string,
    subscriptionId: string,
    invoiceId: string,
  ): Promise<void> {
    const coupon = await tx.coupon.findUnique({ where: { code } });
    if (!coupon) {
      return;
    }

    // الفريد على (الكود، المؤسسة) يجعل إعادة التشغيل بلا أثر ثانٍ.
    const created = await tx.couponRedemption
      .create({
        data: { couponId: coupon.id, organizationId, invoiceId, cyclesUsed: 1 },
      })
      .catch(() => null);

    if (!created) {
      return;
    }

    await tx.coupon.update({
      where: { id: coupon.id },
      data: { redeemedCount: { increment: 1 } },
    });

    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { couponId: coupon.id },
    });
  }

  private async requirePlan(key: string) {
    const plan = await this.prisma.plan.findUnique({ where: { key } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('الباقة غير متاحة');
    }
    return plan;
  }

  private async requirePrice(planId: string, interval: BillingInterval) {
    const price = await this.prisma.planPrice.findFirst({
      where: { planId, interval, isActive: true },
    });
    if (!price) {
      throw new NotFoundException('لا يوجد سعر ساري لهذه الدورة');
    }
    return price;
  }
}

/** نيّة الاشتراك المحفوظة على سطر الفاتورة. */
interface SubscriptionIntent {
  planId: string;
  priceId: string;
  interval: BillingInterval;
  quantity: number;
  couponCode: string | null;
}

/**
 * يقارن باقتين بترتيب معروف.
 *
 * الترتيب مفتاحي لا سعري: باقة أغلى ليست بالضرورة أعلى، وقراءة السعر
 * هنا كانت ستجعل تخفيضاً مؤقتاً يقلب اتجاه التغيير.
 */
const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, business: 2, enterprise: 3 };

export function comparePlans(from: string, to: string): 'upgrade' | 'downgrade' | 'same' {
  const fromRank = PLAN_RANK[from] ?? 1;
  const toRank = PLAN_RANK[to] ?? 1;

  if (fromRank === toRank) {
    return 'same';
  }
  return toRank > fromRank ? 'upgrade' : 'downgrade';
}
