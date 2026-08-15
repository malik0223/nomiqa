import { QUEUE_NAMES, type EmailJobData, type EmailTemplate } from '@nomiqa/contracts';
import { getPrismaClient, withRlsContext } from '@nomiqa/database';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';

const prisma = getPrismaClient();

let queue: Queue<EmailJobData> | undefined;

/**
 * منتِج بريد داخل الـWorker.
 *
 * يوجد نظير له في الـAPI (`EmailService`)، والتكرار مقصود: الـWorker
 * لا يستورد شيئاً من NestJS، وربط الاثنين بحزمة مشتركة كان سيجرّ حاوية
 * الاعتماديات كاملة إلى عملية لا تحتاجها. المشترك الحقيقي — أسماء
 * الطوابير وشكل الحمولة وتجزئة المستلم — يعيش في `@nomiqa/contracts`
 * وفي دالة `hashRecipient` المطابقة نصاً في الطرفين.
 */
export function initEmailProducer(connection: Redis): void {
  queue = new Queue<EmailJobData>(QUEUE_NAMES.EMAIL, { connection });
}

export async function closeEmailProducer(): Promise<void> {
  await queue?.close();
  queue = undefined;
}

export interface EnqueueEmailInput {
  to: string;
  template: EmailTemplate;
  locale: 'ar' | 'en';
  variables: Record<string, string>;
  organizationId: string;
  /**
   * مفتاح ثبات صريح.
   *
   * يجب أن يُشتق من **معرّف الحدث لا من محتواه**: حدث Outbox واحد قد
   * يُعاد التقاطه بعد فشل جزئي، والمفتاح الثابت هو ما يمنع وصول رسالة
   * شكر مرتين لنفس الزائر.
   */
  idempotencyKey: string;
}

export async function enqueueEmail(input: EnqueueEmailInput): Promise<void> {
  if (!queue) {
    throw new Error('منتِج البريد غير مهيّأ');
  }

  await withRlsContext(prisma, { organizationId: input.organizationId }, (tx) =>
    tx.notificationDelivery.create({
      data: {
        organizationId: input.organizationId,
        channel: 'email',
        template: input.template,
        locale: input.locale,
        // تجزئة لا عنوان: البريد بيانات شخصية (§9.4).
        recipientHash: hashRecipient(input.to),
        status: 'pending',
      },
    }),
  );

  await queue.add(
    input.template,
    {
      idempotencyKey: input.idempotencyKey,
      organizationId: input.organizationId,
      to: input.to,
      template: input.template,
      locale: input.locale,
      variables: input.variables,
    },
    {
      jobId: input.idempotencyKey,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 1_000, age: 24 * 3_600 },
      removeOnFail: { count: 5_000, age: 7 * 24 * 3_600 },
    },
  );
}

/** يجب أن يطابق hashRecipient في الـAPI وفي معالج البريد. */
export function hashRecipient(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/** مفتاح ثبات قصير مشتق من معرّفات — لا من محتوى قد يتغير. */
export function idempotencyKeyFrom(...parts: string[]): string {
  return createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 32);
}
