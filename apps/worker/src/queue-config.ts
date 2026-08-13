import type { JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';

/**
 * BullMQ يشترط `maxRetriesPerRequest: null` على اتصال العامل،
 * وإلا يفشل الانتظار الطويل على الطابور.
 */
export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL مطلوب لتشغيل الـWorker');
  }

  return new Redis(url, { maxRetriesPerRequest: null });
}

/**
 * ضوابط الطوابير الافتراضية (§5.8 من وثيقة المعمارية).
 *
 * كل معالج مهمة يجب أن يكون Idempotent — إعادة المحاولة هنا مضمونة،
 * فلا يجوز أن تُنتج المحاولة الثانية أثراً مزدوجاً (فاتورة، بريد، سجل CRM).
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { count: 1_000, age: 24 * 3_600 },
  // نحتفظ بالفاشلة أطول للتشخيص قبل حذفها.
  removeOnFail: { count: 5_000, age: 7 * 24 * 3_600 },
};

export const DEFAULT_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);
