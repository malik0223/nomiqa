import { Worker } from 'bullmq';
import { QUEUE_NAMES, type AccountDeletionJobData, type EmailJobData } from '@nomiqa/contracts';
import { createLogger } from '@nomiqa/observability';
import { handleAccountDeletion, handleAccountDeletionFailure } from './account/deletion-handler.js';
import { handleEmailFailure, handleEmailJob } from './email/handler.js';
import { closeTransporter } from './email/transport.js';
import { DEFAULT_CONCURRENCY, createRedisConnection } from './queue-config.js';

const logger = createLogger('worker');
const connection = createRedisConnection();

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
    async (job) => {
      logger.info({ jobId: job.id }, 'إرسال حدث Outbox');
      // TODO(S6): قراءة outbox_events ونشرها بطريقة Idempotent.
    },
    { connection, concurrency: DEFAULT_CONCURRENCY },
  ),
];

for (const worker of workers) {
  worker.on('failed', (job, error) => {
    logger.error(
      { queue: worker.name, jobId: job?.id, attempts: job?.attemptsMade, error: error.message },
      'فشلت المهمة',
    );

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
  await closeTransporter();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
