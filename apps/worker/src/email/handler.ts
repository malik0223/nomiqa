import type { EmailJobData } from '@nomiqa/contracts';
import { getPrismaClient, withRlsContext } from '@nomiqa/database';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { renderEmail } from './templates.js';
import { getTransporter, mailFrom } from './transport.js';

const prisma = getPrismaClient();

/**
 * معالج مهام البريد.
 *
 * Idempotent بقدر ما يسمح به SMTP: الطابور يمنع ازدواج المهمة بـjobId،
 * لكن الفشل بعد التسليم وقبل تسجيل النجاح قد يعيد الإرسال. هذا مقبول
 * لرسائل إعلامية، وغير مقبول لأي رسالة ذات أثر مالي — تلك تحتاج
 * تسجيل الحالة قبل التسليم لا بعده.
 */
export async function handleEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { to, template, locale, variables, organizationId } = job.data;

  const rendered = renderEmail(template, locale, variables);

  const info = await getTransporter().sendMail({
    from: mailFrom(),
    to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });

  if (organizationId) {
    await markDelivered(organizationId, template, to, info.messageId, job.attemptsMade);
  }
}

export async function handleEmailFailure(
  job: Job<EmailJobData> | undefined,
  error: Error,
): Promise<void> {
  if (!job?.data.organizationId) {
    return;
  }

  const { organizationId, template, to } = job.data;

  await withRlsContext(prisma, { organizationId }, async (tx) => {
    await tx.notificationDelivery.updateMany({
      where: {
        organizationId,
        template,
        recipientHash: hashRecipient(to),
        status: 'pending',
      },
      data: {
        status: 'failed',
        attempts: job.attemptsMade,
        // رسالة الخطأ قد تحتوي عنوان المستلم — نقصّها ونحتفظ بالنوع فقط.
        lastError: error.message.slice(0, 200),
      },
    });
  });
}

async function markDelivered(
  organizationId: string,
  template: string,
  to: string,
  messageId: string | undefined,
  attempts: number,
): Promise<void> {
  await withRlsContext(prisma, { organizationId }, async (tx) => {
    await tx.notificationDelivery.updateMany({
      where: { organizationId, template, recipientHash: hashRecipient(to), status: 'pending' },
      data: {
        status: 'sent',
        sentAt: new Date(),
        attempts: attempts + 1,
        providerMessageId: messageId ?? null,
      },
    });
  });
}

/** يجب أن يطابق hashRecipient في الـAPI حتى يُربط السجل بالمهمة. */
function hashRecipient(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}
