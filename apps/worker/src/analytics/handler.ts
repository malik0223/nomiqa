import type { AnalyticsIngestJobData } from '@nomiqa/contracts';
import { getPrismaClient } from '@nomiqa/database';
import { createLogger } from '@nomiqa/observability';
import type { Job } from 'bullmq';

const prisma = getPrismaClient();
const logger = createLogger('analytics');

/** المدى الذي يُعاد حسابه في كل دورة ساعية. */
const HOUR_ROLLUP_LOOKBACK_HOURS = 3;

/** المدى الذي يُعاد حسابه في كل دورة يومية. */
const DAY_ROLLUP_LOOKBACK_DAYS = 2;

/** مدة الاحتفاظ بالأحداث الخام. التجميعات تبقى بعدها. */
const RAW_EVENT_RETENTION_DAYS = 90;

/**
 * كتابة دفعة أحداث.
 *
 * الإدراج يمر بدالة `analytics_ingest`: الدفعة الواحدة قد تخلط بطاقات
 * مؤسسات مختلفة، وسياق RLS يقبل مؤسسة واحدة في المعاملة. الدالة تشتق
 * المؤسسة من البطاقة نفسها، فلا يستطيع أحد حقن أحداث في مؤسسة يختارها.
 *
 * **ليست Idempotent، عمداً.** إعادة المحاولة بعد فشل جزئي قد تكرر
 * أحداثاً. البديل — مفتاح فريد لكل حدث — يضيف فهرساً على جدول هو
 * الأعلى كتابةً في المنصة، مقابل دقة لا يحتاجها مقياس اتجاه. الفقدان
 * والتكرار كلاهما مقبول هنا بحدود، وهذا مكتوب لئلا يُقاس هذا الجدول
 * بمعايير جدول محاسبي.
 */
export async function handleAnalyticsIngest(job: Job<AnalyticsIngestJobData>): Promise<void> {
  const { events } = job.data;
  if (events.length === 0) return;

  const inserted = await prisma.$queryRaw<Array<{ analytics_ingest: number }>>`
    SELECT analytics_ingest(${JSON.stringify(events)}::jsonb)
  `;

  const written = inserted[0]?.analytics_ingest ?? 0;

  // الفارق بين المستلَم والمكتوب طبيعي: أحداث بطاقة أُلغي نشرها
  // تُسقط في الدالة. نسجّله فقط حين يُسقَط كل شيء — إشارة إلى slug
  // خاطئ لا إلى بطاقة واحدة تغيّرت حالتها.
  if (written === 0) {
    logger.warn({ received: events.length }, 'أُسقطت الدفعة كاملة — لا بطاقة منشورة مطابقة');
  }
}

/**
 * إعادة حساب التجميعات.
 *
 * نُعيد حساب مدى متداخل في كل دورة بدل حساب ما استُجد فقط: الحدث قد
 * يصل متأخراً بعد إعادة محاولة، والحساب التراكمي كان سيتجاهله إلى
 * الأبد. الدالة Idempotent فإعادة الحساب لا تضاعف شيئاً.
 */
export async function handleAnalyticsRollup(): Promise<void> {
  const now = Date.now();

  const hourly = await prisma.$queryRaw<Array<{ analytics_rollup_range: number }>>`
    SELECT analytics_rollup_range(
      'hour',
      ${new Date(now - HOUR_ROLLUP_LOOKBACK_HOURS * 3_600_000)},
      ${new Date(now)}
    )
  `;

  const daily = await prisma.$queryRaw<Array<{ analytics_rollup_range: number }>>`
    SELECT analytics_rollup_range(
      'day',
      ${new Date(now - DAY_ROLLUP_LOOKBACK_DAYS * 24 * 3_600_000)},
      ${new Date(now)}
    )
  `;

  logger.debug(
    {
      hourly: hourly[0]?.analytics_rollup_range ?? 0,
      daily: daily[0]?.analytics_rollup_range ?? 0,
    },
    'اكتمل التجميع',
  );
}

/**
 * تنظيف الأحداث الخام.
 *
 * ليس توفيراً في التخزين بل تقليلاً للبيانات: الصف الخام يحمل تجزئة
 * زائر ونطاق مُحيل ونوع جهاز، ولا يضيف شيئاً بعد تجميعه.
 */
export async function handleAnalyticsPurge(): Promise<void> {
  // `::int` إلزامي — راجع التعليق في outbox/dispatcher.ts
  const rows = await prisma.$queryRaw<Array<{ analytics_purge_events: number }>>`
    SELECT analytics_purge_events(${RAW_EVENT_RETENTION_DAYS}::int)
  `;

  const removed = rows[0]?.analytics_purge_events ?? 0;
  if (removed > 0) {
    logger.info({ removed, retentionDays: RAW_EVENT_RETENTION_DAYS }, 'حُذفت أحداث خام منتهية');
  }
}
