import { EMAIL_TEMPLATES } from '@nomiqa/contracts';
import { getPrismaClient, withRlsContext } from '@nomiqa/database';
import { createLogger } from '@nomiqa/observability';
import { enqueueEmail, idempotencyKeyFrom } from '../email/producer.js';

const prisma = getPrismaClient();
const logger = createLogger('billing-cycle');

/**
 * دورة الفوترة (خارطة الطريق §9.4).
 *
 * ثلاث مهام مستقلة تعمل يومياً:
 *
 *   1. **التذكير قبل التجديد** — إشعار قبل الخصم لا بعده.
 *   2. **مهلة السماح** — خفض ما استنفد مهلته.
 *   3. **تسوية المدفوعات المعلّقة** — تأكيد ما لم يصل نداؤه الراجع.
 *
 * الثالثة هي شبكة الأمان الحقيقية: النداء الراجع من البوابة تسريع لا
 * مصدر وحيد. عميل دفع ثم أُغلق متصفحه قبل العودة، ونداءٌ ضاع في عطل
 * شبكة — كلاهما يُسوّى هنا خلال دقائق بلا تدخل.
 *
 * **الخفض الفعلي والتفعيل يجريان في الـAPI** عبر مسارات HTTP داخلية؟
 * لا — الـWorker يملك وصولاً مباشراً إلى قاعدة البيانات، ومنطق دورة
 * الحياة مكرَّر هنا بأدنى صورة ممكنة: تحديث حالة وتسجيل حدث. المنطق
 * التجاري الكامل (الحصص، الترقية، الرصيد) يبقى في الـAPI حيث يُستدعى
 * من المستخدم.
 */

/** يُنبَّه العميل قبل التجديد بهذه المدة. */
const RENEWAL_NOTICE_DAYS = 3;

/** مهلة السماح بعد فشل التحصيل — تطابق ما في الـAPI. */
const GRACE_PERIOD_DAYS = 7;

const BATCH_SIZE = 100;

interface DueSubscriptionRow {
  subscription_id: string;
  organization_id: string;
  status: string;
  current_period_end: Date;
}

/**
 * يفتح فترة تجديد للاشتراكات المقتربة من نهايتها.
 *
 * لا يُصدر الفاتورة هنا: إصدارها يمر بمنطق الأسعار والخصم والضريبة
 * في الـAPI. ما يفعله الـWorker هو التنبيه، وبدء مهلة السماح حين تمر
 * نهاية الفترة بلا سداد.
 */
export async function handleBillingRenewals(): Promise<void> {
  const rows = await prisma.$queryRaw<DueSubscriptionRow[]>`
    SELECT * FROM billing_subscriptions_due(
      ${`${RENEWAL_NOTICE_DAYS} days`}::interval,
      ${BATCH_SIZE}::int
    )
  `;

  for (const row of rows) {
    try {
      if (row.current_period_end <= new Date()) {
        await enterGracePeriod(row);
      } else {
        await notifyUpcomingRenewal(row);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطأ غير معروف';
      logger.error({ subscriptionId: row.subscription_id, error: message }, 'فشل تجديد اشتراك');
    }
  }

  if (rows.length > 0) {
    logger.info({ count: rows.length }, 'عولجت اشتراكات مستحقة');
  }
}

/**
 * ينهي مهلة السماح: خفض إلى المجانية.
 *
 * لا يحذف بطاقةً ولا عضواً ولا جهة اتصال — الحدود تمنع الإضافة والموجود
 * يبقى. حذف بيانات عميل لأن دفعته تأخرت خسارة لا رجعة فيها مقابل مبلغ
 * قد يصل غداً.
 */
export async function handleBillingExpirations(): Promise<void> {
  const rows = await prisma.$queryRaw<
    Array<{ subscription_id: string; organization_id: string }>
  >`SELECT * FROM billing_subscriptions_overdue(${BATCH_SIZE}::int)`;

  const free = await prisma.plan.findUnique({ where: { key: 'free' }, select: { id: true } });

  if (!free) {
    logger.error({}, 'الباقة المجانية غير موجودة — تعذّر خفض المتأخرين');
    return;
  }

  for (const row of rows) {
    try {
      await withRlsContext(prisma, { organizationId: row.organization_id }, async (tx) => {
        const current = await tx.subscription.findFirst({
          where: { id: row.subscription_id, status: 'past_due' },
          select: { planId: true },
        });

        // الشرط على الحالة داخل التحديث لا خارجه: سدادٌ وصل بين
        // القراءة والكتابة يجب ألا يُخفَّض صاحبه.
        const downgraded = await tx.subscription.updateMany({
          where: { id: row.subscription_id, status: 'past_due' },
          data: {
            planId: free.id,
            priceId: null,
            status: 'active',
            quantity: 1,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date('2999-12-31T00:00:00Z'),
            gracePeriodEndsAt: null,
            couponId: null,
          },
        });

        if (downgraded.count === 0) {
          return;
        }

        await tx.subscriptionEvent.create({
          data: {
            organizationId: row.organization_id,
            subscriptionId: row.subscription_id,
            type: 'expired',
            fromPlanId: current?.planId ?? null,
            toPlanId: free.id,
            metadata: { reason: 'grace_period_expired' },
          },
        });
      });

      logger.info({ organizationId: row.organization_id }, 'خُفِّض اشتراك بعد مهلة السماح');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطأ غير معروف';
      logger.error({ subscriptionId: row.subscription_id, error: message }, 'فشل خفض اشتراك');
    }
  }
}

/**
 * يسوّي المدفوعات المعلّقة.
 *
 * **لا يستعلم البوابة من هنا**: مفاتيح المزوّد تعيش في الـAPI، ونسخها
 * إلى الـWorker يضاعف أماكن وجود السرّ. ما يفعله هذا المعالج هو وسم
 * الجلسات المنتهية صلاحيتها فاشلةً حتى لا تبقى «معلّقة» إلى الأبد
 * فتمنع فتح جلسة جديدة للفاتورة نفسها.
 *
 * التأكيد الفعلي يقع في الـAPI عبر النداء الراجع أو عودة المتصفح، وكلاهما
 * يستعلم البوابة مباشرةً.
 */
export async function handleStalePayments(): Promise<void> {
  const expired = await prisma.payment.updateMany({
    where: {
      status: 'pending',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'canceled', rawStatus: 'session_expired' },
  });

  if (expired.count > 0) {
    logger.info({ count: expired.count }, 'أُغلقت جلسات دفع منتهية');
  }
}

async function notifyUpcomingRenewal(row: DueSubscriptionRow): Promise<void> {
  const subscription = await withRlsContext(
    prisma,
    { organizationId: row.organization_id },
    (tx) =>
      tx.subscription.findFirst({
        where: { id: row.subscription_id },
        include: { plan: { select: { name: true } }, price: true },
      }),
  );

  if (!subscription || subscription.cancelAtPeriodEnd) {
    return;
  }

  const recipient = await billingRecipient(row.organization_id);
  if (!recipient) {
    return;
  }

  await enqueueEmail({
    to: recipient.email,
    template: EMAIL_TEMPLATES.INVOICE_ISSUED,
    locale: recipient.locale,
    variables: {
      number: 'التجديد القادم',
      amount: formatOmr((subscription.price?.amountBaisa ?? 0) * subscription.quantity),
      dueAt: subscription.currentPeriodEnd.toISOString().slice(0, 10),
      payUrl: `${appBaseUrl()}/billing`,
    },
    organizationId: row.organization_id,
    // مفتاح مشتق من نهاية الفترة: الدورة تمر يومياً لثلاثة أيام
    // متتالية، والمفتاح نفسه يمنع ثلاث رسائل عن تجديد واحد.
    idempotencyKey: idempotencyKeyFrom(
      'renewal-notice',
      `${row.subscription_id}:${row.current_period_end.toISOString()}`,
    ),
  });
}

async function enterGracePeriod(row: DueSubscriptionRow): Promise<void> {
  const graceEnd = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 3_600_000);

  const entered = await withRlsContext(
    prisma,
    { organizationId: row.organization_id },
    async (tx) => {
      const updated = await tx.subscription.updateMany({
        where: { id: row.subscription_id, status: { in: ['active', 'trialing'] } },
        data: { status: 'past_due', gracePeriodEndsAt: graceEnd },
      });

      if (updated.count === 0) {
        return false;
      }

      await tx.subscriptionEvent.create({
        data: {
          organizationId: row.organization_id,
          subscriptionId: row.subscription_id,
          type: 'payment_failed',
          metadata: { graceDays: GRACE_PERIOD_DAYS, source: 'worker' },
        },
      });

      return true;
    },
  );

  if (!entered) {
    return;
  }

  const recipient = await billingRecipient(row.organization_id);
  if (!recipient) {
    return;
  }

  await enqueueEmail({
    to: recipient.email,
    template: EMAIL_TEMPLATES.PAYMENT_FAILED,
    locale: recipient.locale,
    variables: {
      graceEndsAt: graceEnd.toISOString().slice(0, 10),
      payUrl: `${appBaseUrl()}/billing`,
    },
    organizationId: row.organization_id,
    idempotencyKey: idempotencyKeyFrom('grace-start', row.subscription_id),
  });
}

/**
 * مستلم رسائل الفوترة.
 *
 * بريد الفوترة المُعلَن أولاً، ثم مالك المؤسسة. إرسال إشعار مالي إلى
 * كل الأعضاء تسريبٌ لمعلومة تجارية داخل المؤسسة نفسها.
 */
async function billingRecipient(
  organizationId: string,
): Promise<{ email: string; locale: 'ar' | 'en' } | null> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { billingEmail: true, defaultLocale: true },
  });

  if (organization?.billingEmail) {
    return {
      email: organization.billingEmail,
      locale: organization.defaultLocale === 'en' ? 'en' : 'ar',
    };
  }

  const owner = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.organizationMembership.findFirst({
      where: {
        status: 'active',
        revokedAt: null,
        roles: { some: { role: { key: 'owner' } } },
      },
      include: { user: { select: { email: true, locale: true, deletedAt: true } } },
    }),
  );

  if (!owner || owner.user.deletedAt) {
    logger.warn({ organizationId }, 'لا مستلم لرسائل الفوترة');
    return null;
  }

  return {
    email: owner.user.email,
    locale: owner.user.locale === 'en' ? 'en' : 'ar',
  };
}

/** ريال عُماني للعرض في نص الرسالة. */
function formatOmr(baisa: number): string {
  return `${Math.floor(baisa / 1000)}.${String(baisa % 1000).padStart(3, '0')}`;
}

function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
