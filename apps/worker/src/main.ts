import { Worker } from 'bullmq';
import { QUEUE_NAMES } from '@nomiqa/contracts';
import { createLogger } from '@nomiqa/observability';
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
  new Worker(
    QUEUE_NAMES.EMAIL,
    async (job) => {
      logger.info({ jobId: job.id, name: job.name }, 'معالجة مهمة بريد');
      // TODO(S2): ربط مزوّد البريد الفعلي.
    },
    { connection, concurrency: DEFAULT_CONCURRENCY },
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
  });
}

logger.info({ queues: workers.map((w) => w.name) }, 'الـWorker يعمل');

/** إيقاف نظيف: ننهي المهام الجارية قبل الخروج بدل قطعها. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'بدء الإيقاف النظيف');
  await Promise.all(workers.map((worker) => worker.close()));
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
