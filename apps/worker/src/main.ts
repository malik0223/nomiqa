import './instrument.js';
import * as Sentry from '@sentry/node';
import { Queue, Worker } from 'bullmq';
import {
  QUEUE_NAMES,
  type AccountDeletionJobData,
  type AnalyticsIngestJobData,
  type EmailJobData,
  type EmployeeImportJobData,
} from '@nomiqa/contracts';
import { createLogger } from '@nomiqa/observability';
import { handleAccountDeletion, handleAccountDeletionFailure } from './account/deletion-handler.js';
import {
  handleAnalyticsIngest,
  handleAnalyticsPurge,
  handleAnalyticsRollup,
} from './analytics/handler.js';
import {
  handleBillingExpirations,
  handleBillingRenewals,
  handleStalePayments,
} from './billing/cycle-handler.js';
import { verifyPendingDomains } from './branding/domain-verifier.js';
import { handleEmailFailure, handleEmailJob } from './email/handler.js';
import {
  handleEmployeeImport,
  handleEmployeeImportFailure,
} from './teams/import-handler.js';
import { closeEmailProducer, initEmailProducer } from './email/producer.js';
import { closeTransporter } from './email/transport.js';
import { dispatchOutbox } from './outbox/dispatcher.js';
import { DEFAULT_CONCURRENCY, createRedisConnection } from './queue-config.js';

const logger = createLogger('worker');
const connection = createRedisConnection();

// الـWorker منتِج بريد أيضاً لا مستهلك فقط: مرسل الـOutbox يحوّل
// الأحداث إلى رسائل، فيحتاج الطابور من الجهتين.
initEmailProducer(connection);

/** كل ثانيتين: الزائر يرى رسالة الشكر قبل أن يغلق الصفحة. */
const OUTBOX_INTERVAL_MS = 2_000;

/**
 * كل خمس دقائق.
 *
 * تأخير يقبله المستخدم لأنه معلن في اللوحة (`updatedAt`). تقصيره
 * يعني إعادة حساب نفس السلال بلا داع، وإطالته تجعل صاحب البطاقة يظن
 * أن زيارةً للتو لم تُحتسب.
 */
const ROLLUP_INTERVAL_MS = 5 * 60_000;

/** يومياً: التنظيف يمس صفوفاً قديمة، ولا شيء يستعجله. */
const PURGE_INTERVAL_MS = 24 * 3_600_000;

/** أسماء المهام المجدولة على طابور التحليلات. */
const ANALYTICS_ROLLUP_JOB = 'rollup';
const ANALYTICS_PURGE_JOB = 'purge';

/**
 * دورة الفوترة: كل ساعة.
 *
 * ليست يومية رغم أن الاستحقاقات يومية: تسوية جلسات الدفع المنتهية
 * تجري في الدورة نفسها، وترك فاتورة بجلسة «معلّقة» ميتة ليوم كامل
 * يمنع العميل من فتح جلسة جديدة لها.
 */
const BILLING_INTERVAL_MS = 3_600_000;

/** فحص النطاقات: كل ربع ساعة. انتشار DNS يقاس بالدقائق لا بالثواني. */
const DOMAIN_CHECK_INTERVAL_MS = 15 * 60_000;

const BILLING_RENEW_JOB = 'renew';
const BILLING_EXPIRE_JOB = 'expire';
const BILLING_STALE_JOB = 'stale-payments';
const DOMAIN_VERIFY_JOB = 'verify-domains';

/**
 * نقطة دخول الـWorker.
 *
 * كل طابور يُنشأ كـWorker مستقل حتى لا يحجب حمل ثقيل (معالجة الصور)
 * طابوراً حساساً للزمن (البريد) — راجع "فصل Queues حسب طبيعة الحمل" §5.8.
 */
const workers = [
  new Worker<EmailJobData>(
    QUEUE_NAMES.EMAIL,
    async (job) => {
      logger.info({ jobId: job.id, template: job.data.template }, 'إرسال بريد');
      await handleEmailJob(job);
    },
    { connection, concurrency: DEFAULT_CONCURRENCY },
  ),

  new Worker<AccountDeletionJobData>(
    QUEUE_NAMES.ACCOUNT_DELETION,
    async (job) => {
      logger.info({ jobId: job.id, requestId: job.data.requestId }, 'تنفيذ حذف حساب');
      await handleAccountDeletion(job);
    },
    // تسلسلياً: الحذف يمس عدة أنظمة، والتوازي يعقّد تشخيص الفشل
    // في عملية لا رجعة فيها.
    { connection, concurrency: 1 },
  ),

  new Worker(
    QUEUE_NAMES.OUTBOX_DISPATCH,
    async () => {
      const dispatched = await dispatchOutbox();
      if (dispatched > 0) {
        logger.info({ dispatched }, 'أُرسلت أحداث Outbox');
      }
    },
    // تسلسلياً: المطالبة ذرّية في قاعدة البيانات، فالتوازي هنا يضيف
    // اتصالات لا إنتاجية — الدورة تتكرر كل ثوانٍ أصلاً.
    { connection, concurrency: 1 },
  ),

  /**
   * التحليلات: كتابة على دفعات، وتجميع، وتنظيف.
   *
   * طابور واحد بثلاثة أنواع مهام لا ثلاثة طوابير: الثلاثة تمس الجدولين
   * نفسيهما، وفصلها كان سيسمح بتجميع يعمل بينما دفعة إدراج ما زالت
   * جارية — فيُحسب على بيانات نصف مكتوبة.
   */
  new Worker<AnalyticsIngestJobData>(
    QUEUE_NAMES.ANALYTICS_INGEST,
    async (job) => {
      if (job.name === ANALYTICS_ROLLUP_JOB) {
        await handleAnalyticsRollup();
        return;
      }
      if (job.name === ANALYTICS_PURGE_JOB) {
        await handleAnalyticsPurge();
        return;
      }
      await handleAnalyticsIngest(job);
    },
    { connection, concurrency: 1 },
  ),

  /**
   * استيراد الموظفين (§9.2).
   *
   * تسلسلياً: دفعتان لمؤسسة واحدة قد تحملان البريد نفسه، وتنفيذهما
   * معاً يجعل فحص «هل توجد دعوة معلّقة؟» يمر في كليهما فتُرسل دعوتان.
   */
  new Worker<EmployeeImportJobData>(
    QUEUE_NAMES.EMPLOYEE_IMPORT,
    async (job) => {
      logger.info({ jobId: job.id, rows: job.data.rows.length }, 'تنفيذ دفعة استيراد');
      await handleEmployeeImport(job);
    },
    { connection, concurrency: 1 },
  ),

  /**
   * دورة الفوترة وفحص النطاقات (§9.3 و§9.4).
   *
   * طابور واحد لأربع مهام دورية: كلها تشغيلية بلا مستخدم ينتظرها،
   * وتسلسلها يمنع تداخل تجديد مع خفض على الاشتراك نفسه.
   */
  new Worker(
    QUEUE_NAMES.BILLING_CYCLE,
    async (job) => {
      switch (job.name) {
        case BILLING_RENEW_JOB:
          await handleBillingRenewals();
          return;
        case BILLING_EXPIRE_JOB:
          await handleBillingExpirations();
          return;
        case BILLING_STALE_JOB:
          await handleStalePayments();
          return;
        case DOMAIN_VERIFY_JOB:
          await verifyPendingDomains();
          return;
        default:
          logger.warn({ name: job.name }, 'مهمة دورية غير معروفة');
      }
    },
    { connection, concurrency: 1 },
  ),
];

/**
 * جدولة الدورات المتكررة.
 *
 * تُضاف من الـWorker نفسه لا من الـAPI: هذه دورات تشغيلية لا يطلبها
 * مستخدم، وربطها بالـAPI كان سيجعلها تتوقف إن نُشر الـWorker وحده.
 * إضافة نفس المهمة المتكررة من عدة نسخ آمنة — BullMQ يعرّفها بمفتاحها.
 */
const outboxQueue = new Queue(QUEUE_NAMES.OUTBOX_DISPATCH, { connection });
const analyticsQueue = new Queue(QUEUE_NAMES.ANALYTICS_INGEST, { connection });
const billingQueue = new Queue(QUEUE_NAMES.BILLING_CYCLE, { connection });
const schedulers = [outboxQueue, analyticsQueue, billingQueue];

// تفريغ السجل عند الاكتمال مقصود في الثلاث: مهمة دورية ناجحة لا قيمة
// لتاريخها، وتراكمها يملأ Redis بما لا يُقرأ.
await outboxQueue.add(
  'dispatch',
  {},
  {
    repeat: { every: OUTBOX_INTERVAL_MS },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
);

await analyticsQueue.add(
  ANALYTICS_ROLLUP_JOB,
  { events: [] },
  {
    repeat: { every: ROLLUP_INTERVAL_MS },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
);

await analyticsQueue.add(
  ANALYTICS_PURGE_JOB,
  { events: [] },
  {
    repeat: { every: PURGE_INTERVAL_MS },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
);

for (const [name, interval] of [
  [BILLING_RENEW_JOB, BILLING_INTERVAL_MS],
  [BILLING_EXPIRE_JOB, BILLING_INTERVAL_MS],
  [BILLING_STALE_JOB, BILLING_INTERVAL_MS],
  [DOMAIN_VERIFY_JOB, DOMAIN_CHECK_INTERVAL_MS],
] as const) {
  await billingQueue.add(
    name,
    {},
    {
      repeat: { every: interval },
      removeOnComplete: true,
      // الفاشلة تبقى أطول: خلل في دورة الفوترة يمس مالاً، وتشخيصه
      // يحتاج تاريخاً لا لقطةً واحدة.
      removeOnFail: { count: 500 },
    },
  );
}

for (const worker of workers) {
  worker.on('failed', (job, error) => {
    logger.error(
      { queue: worker.name, jobId: job?.id, attempts: job?.attemptsMade, error: error.message },
      'فشلت المهمة',
    );

    // لا حمولة المهمة هنا: قد تحمل بريد المستلم ومتغيرات القالب.
    Sentry.captureException(error, {
      tags: { queue: worker.name },
      extra: { jobId: job?.id, attempts: job?.attemptsMade },
    });

    if (worker.name === QUEUE_NAMES.ACCOUNT_DELETION) {
      const exhausted = job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 1);
      if (exhausted) {
        // فشل حذف مستنفَد للمحاولات يحتاج تدخلاً بشرياً: قد يكون
        // الحساب حُذف جزئياً عبر أنظمة متعددة.
        logger.error(
          { requestId: (job.data as AccountDeletionJobData).requestId },
          'فشل حذف حساب نهائياً — يتطلب مراجعة يدوية',
        );
        void handleAccountDeletionFailure(job as never, error).catch((failure: Error) =>
          logger.error({ error: failure.message }, 'تعذّر تسجيل فشل الحذف'),
        );
      }
    }

    if (worker.name === QUEUE_NAMES.EMPLOYEE_IMPORT) {
      // دفعة استنفدت محاولاتها تبقى «قيد التنفيذ» في اللوحة إلى الأبد
      // ما لم نوسمها فاشلة — والمسؤول ينتظر نتيجة لن تصل.
      const exhausted = job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 1);
      if (exhausted) {
        void handleEmployeeImportFailure(job as never, error).catch((failure: Error) =>
          logger.error({ error: failure.message }, 'تعذّر تسجيل فشل دفعة الاستيراد'),
        );
      }
    }

    if (worker.name === QUEUE_NAMES.EMAIL) {
      // نسجّل الفشل بعد استنفاد المحاولات فقط، وإلا وسمنا رسالة
      // ستنجح في المحاولة التالية بأنها فاشلة.
      const exhausted = job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 1);
      if (exhausted) {
        void handleEmailFailure(job as never, error).catch((failure: Error) =>
          logger.error({ error: failure.message }, 'تعذّر تسجيل فشل البريد'),
        );
      }
    }
  });
}

logger.info({ queues: workers.map((w) => w.name) }, 'الـWorker يعمل');

/** إيقاف نظيف: ننهي المهام الجارية قبل الخروج بدل قطعها. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'بدء الإيقاف النظيف');
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all(schedulers.map((queue) => queue.close()));
  await closeEmailProducer();
  await closeTransporter();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
