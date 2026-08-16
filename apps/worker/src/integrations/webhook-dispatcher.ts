import {
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from '@nomiqa/contracts';
import { getPrismaClient } from '@nomiqa/database';
import { createLogger } from '@nomiqa/observability';
import { createHmac } from 'node:crypto';

const prisma = getPrismaClient();
const logger = createLogger('webhooks');

/** حجم الدفعة. صغير: الدورة تتكرر كل بضع ثوانٍ. */
const BATCH_SIZE = 20;

/** بعدها يُوسم التسليم فاشلاً ويحتاج تدخلاً. */
const MAX_ATTEMPTS = 6;

/** مهلة النداء. أطول منها يعني وجهة لا تصلح مستقبِلاً لأحداث. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * مدة الحجز.
 *
 * التسليم المُطالَب به يُدفع موعده إلى الأمام دقيقتين، فلا تلتقطه نسخة
 * ثانية من الـWorker وهو قيد الإرسال. أطول من أطول مهلة نداء بكثير:
 * الحجز الذي ينتهي قبل انتهاء النداء يعني نداءين متزامنين إلى العميل
 * نفسه بالحدث نفسه.
 */
const LEASE_MINUTES = 2;

/** بعد هذا العدد من الإخفاقات المتتالية تُوقَف الوجهة آلياً. */
const DISABLE_AFTER_FAILURES = 20;

interface ClaimedDelivery {
  id: string;
  organization_id: string;
  endpoint_id: string;
  event_type: string;
  event_id: string;
  payload: unknown;
  attempts: number;
  url: string;
  secret: string;
}

/**
 * مرسل الـWebhooks (§11.4).
 *
 * المطالبة ذرّية بـ`FOR UPDATE SKIP LOCKED`: عدة نسخ من الـWorker
 * تعمل معاً بلا أن يلتقط اثنان التسليم نفسه — نفس مبدأ
 * `outbox_claim_batch`، مطبَّقاً هنا باستعلام واحد بدل دالة لأن
 * الشرط أبسط ولا يتكرر في مكان آخر.
 *
 * والحجز يقع **قبل** النداء لا بعده: زيادة العدّاد بعد فشل الشبكة
 * كانت تترك تسليماً «قيد الإرسال» إلى الأبد إن سقط الـWorker في
 * المنتصف.
 */
export async function dispatchWebhooks(): Promise<number> {
  const deliveries = await prisma.$queryRaw<ClaimedDelivery[]>`
    WITH claimed AS (
      SELECT d.id
      FROM webhook_deliveries d
      JOIN webhook_endpoints e ON e.id = d.endpoint_id
      WHERE d.status = 'pending'
        AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
        AND e.is_active = true
        AND e.disabled_at IS NULL
      ORDER BY d.created_at
      LIMIT ${BATCH_SIZE}
      FOR UPDATE OF d SKIP LOCKED
    ),
    leased AS (
      UPDATE webhook_deliveries d
      SET attempts = d.attempts + 1,
          -- make_interval لا نص interval: القيمة تصل معاملاً مربوطاً،
          -- ولا يُستبدل معامل داخل سلسلة نصية في SQL.
          next_attempt_at = now() + make_interval(mins => ${LEASE_MINUTES}::int),
          updated_at = now()
      FROM claimed c
      WHERE d.id = c.id
      RETURNING d.id, d.organization_id, d.endpoint_id, d.event_type, d.event_id,
                d.payload, d.attempts
    )
    SELECT l.*, e.url, e.secret
    FROM leased l
    JOIN webhook_endpoints e ON e.id = l.endpoint_id
  `;

  for (const delivery of deliveries) {
    await deliver(delivery);
  }

  return deliveries.length;
}

async function deliver(delivery: ClaimedDelivery): Promise<void> {
  const body = JSON.stringify({
    id: delivery.event_id,
    type: delivery.event_type,
    createdAt: new Date().toISOString(),
    data: delivery.payload,
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', delivery.secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  try {
    const response = await fetch(delivery.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Nomiqa-Webhooks/1',
        [WEBHOOK_SIGNATURE_HEADER]: signature,
        [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
        // معرّف الحدث في ترويسة: هو ما يجعل المستقبِل Idempotent بلا
        // أن يقرأ الجسم. تسليم يصل مرتين — وهو ممكن دائماً في أي نظام
        // «مرة واحدة على الأقل» — يُتجاهَل بمطابقة هذه القيمة.
        [WEBHOOK_EVENT_ID_HEADER]: delivery.event_id,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    });

    if (response.ok) {
      await markDelivered(delivery, response.status);
      return;
    }

    await markFailed(delivery, response.status, `رد الوجهة بالحالة ${response.status}`);
  } catch (error) {
    // رسالة الخطأ الشبكي تُحفظ كما هي: هي ما يقرؤه صاحب الوجهة
    // ليعرف أن شهادته منتهية أو أن نطاقه لا يُحلّ. لا بيانات فيها.
    await markFailed(delivery, null, (error as Error).message.slice(0, 300));
  }
}

async function markDelivered(delivery: ClaimedDelivery, status: number): Promise<void> {
  await prisma.$transaction([
    prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'delivered',
        responseStatus: status,
        deliveredAt: new Date(),
        nextAttemptAt: null,
        error: null,
      },
    }),
    prisma.webhookEndpoint.update({
      where: { id: delivery.endpoint_id },
      data: { consecutiveFailures: 0, lastSuccessAt: new Date() },
    }),
  ]);
}

/**
 * يسجّل فشلاً ويقرر مصير المحاولة القادمة.
 *
 * التأجيل أُسّي بسقف: `2^attempts` دقيقة حتى ساعة. وجهة مطفأة لساعة
 * لا تستفيد من محاولة كل دقيقة، والإلحاح عليها يشبه هجوماً.
 */
async function markFailed(
  delivery: ClaimedDelivery,
  responseStatus: number | null,
  message: string,
): Promise<void> {
  const exhausted = delivery.attempts >= MAX_ATTEMPTS;
  const delayMinutes = Math.min(60, 2 ** delivery.attempts);

  const endpoint = await prisma.webhookEndpoint.update({
    where: { id: delivery.endpoint_id },
    data: { consecutiveFailures: { increment: 1 }, lastFailureAt: new Date() },
    select: { id: true, consecutiveFailures: true, disabledAt: true },
  });

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: exhausted ? 'failed' : 'pending',
      responseStatus,
      error: message,
      nextAttemptAt: exhausted ? null : new Date(Date.now() + delayMinutes * 60_000),
    },
  });

  // الإيقاف الآلي: وجهة فشلت عشرين مرة متتالية ليست وجهة تتعافى، وكل
  // حدث لاحق يضيف صفاً إلى طابور لن يفرغ. إيقافها **يُعلَن في الشاشة**
  // بسببه، فيعرف صاحبها لماذا صمتت بدل أن يكتشف بعد شهر أن شيئاً لم
  // يصل. إعادة التفعيل بتعديل الوجهة.
  if (!endpoint.disabledAt && endpoint.consecutiveFailures >= DISABLE_AFTER_FAILURES) {
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        disabledAt: new Date(),
        disabledReason: `أُوقفت آلياً بعد ${endpoint.consecutiveFailures} إخفاقاً متتالياً`,
      },
    });

    logger.error({ endpointId: endpoint.id }, 'أُوقفت وجهة Webhook آلياً');
  }
}
