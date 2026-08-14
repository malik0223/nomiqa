import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { QUEUE_NAMES, type EmailJobData, type EmailTemplate } from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SendEmailInput {
  to: string;
  template: EmailTemplate;
  locale?: 'ar' | 'en';
  variables?: Record<string, string>;
  organizationId?: string;
  /** مفتاح ثبات اختياري. يُشتق تلقائياً إن لم يُمرَّر. */
  idempotencyKey?: string;
}

/**
 * منتِج مهام البريد.
 *
 * الـAPI لا يرسل بريداً داخل دورة الطلب إطلاقاً (§5.8): إرسال البريد
 * بطيء ويعتمد على طرف خارجي، وانتظاره يجعل زمن استجابة المستخدم
 * رهينة مزوّد البريد.
 */
@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private connection!: Redis;
  private queue!: Queue<EmailJobData>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL مطلوب لطابور البريد');
    }

    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue<EmailJobData>(QUEUE_NAMES.EMAIL, { connection: this.connection });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueue(input: SendEmailInput): Promise<void> {
    const locale = input.locale ?? 'ar';
    const idempotencyKey =
      input.idempotencyKey ??
      createHash('sha256')
        .update(`${input.template}:${input.to}:${JSON.stringify(input.variables ?? {})}`)
        .digest('hex')
        .slice(0, 32);

    // سجل المحاولة قبل الإدراج في الطابور. لو تعطّل Redis يبقى أثر
    // للمحاولة، ولا يضيع الطلب بلا سجل.
    if (input.organizationId) {
      await withRlsContext(this.prisma, { organizationId: input.organizationId }, (tx) =>
        tx.notificationDelivery.create({
          data: {
            organizationId: input.organizationId,
            channel: 'email',
            template: input.template,
            locale,
            // تجزئة لا عنوان: البريد بيانات شخصية (§9.4).
            recipientHash: hashRecipient(input.to),
            status: 'pending',
          },
        }),
      );
    }

    await this.queue.add(
      input.template,
      {
        idempotencyKey,
        organizationId: input.organizationId,
        to: input.to,
        template: input.template,
        locale,
        variables: input.variables ?? {},
      },
      {
        // jobId فريد يمنع ازدواج نفس الرسالة عند إعادة المحاولة.
        jobId: idempotencyKey,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { count: 1_000, age: 24 * 3_600 },
        removeOnFail: { count: 5_000, age: 7 * 24 * 3_600 },
      },
    );

    this.logger.log(`أُدرجت رسالة ${input.template} في الطابور`);
  }
}

export function hashRecipient(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}
