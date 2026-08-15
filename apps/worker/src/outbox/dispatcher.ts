import { EMAIL_TEMPLATES, OUTBOX_EVENT_TYPES } from '@nomiqa/contracts';
import { getPrismaClient, withRlsContext } from '@nomiqa/database';
import { createLogger } from '@nomiqa/observability';
import { enqueueEmail, idempotencyKeyFrom } from '../email/producer.js';

const prisma = getPrismaClient();
const logger = createLogger('outbox');

/** حجم الدفعة الواحدة. صغير عمداً: الدورة تتكرر كل ثوانٍ. */
const BATCH_SIZE = 50;

/** بعدها يُوسم الحدث failed ويحتاج تدخلاً بدل إعادة محاولة أبدية. */
const MAX_ATTEMPTS = 8;

interface ClaimedEvent {
  id: string;
  organization_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/**
 * مرسل الـTransactional Outbox (§6.10).
 *
 * سبب وجوده: التقاط جهة اتصال يجب أن يكتب الصف **و**يرسل إشعاراً، وهما
 * نظامان مختلفان لا معاملة تجمعهما. لو أدرجنا مهمة البريد مباشرةً عند
 * الالتقاط، لأنتج فشلُ Redis صفَّ جهة اتصال بلا إشعار، ولأنتج فشلُ
 * المعاملة بعد الإدراج إشعاراً عن صف غير موجود. الحدث يُكتب في نفس
 * معاملة الصف، وهذا المرسل يحوّله إلى فعل لاحقاً.
 *
 * المطالبة ذرّية في قاعدة البيانات (`outbox_claim_batch`)، فتشغيل عدة
 * نسخ من الـWorker معاً آمن: لا يلتقط اثنان الحدث نفسه.
 */
export async function dispatchOutbox(): Promise<number> {
  const events = await prisma.$queryRaw<ClaimedEvent[]>`
    SELECT * FROM outbox_claim_batch(${BATCH_SIZE})
  `;

  for (const event of events) {
    try {
      await handleEvent(event);
      await prisma.$executeRaw`SELECT outbox_mark_processed(${event.id}::uuid)`;
    } catch (error) {
      const message = (error as Error).message;
      // لا نُسقط الدفعة كلها لأجل حدث واحد: البقية غالباً سليمة،
      // والتأجيل الأُسّي يعيد هذا وحده لاحقاً.
      logger.error({ eventId: event.id, type: event.event_type, error: message }, 'فشل حدث Outbox');
      await prisma.$executeRaw`
        SELECT outbox_mark_failed(${event.id}::uuid, ${message}, ${MAX_ATTEMPTS})
      `;
    }
  }

  return events.length;
}

async function handleEvent(event: ClaimedEvent): Promise<void> {
  switch (event.event_type) {
    case OUTBOX_EVENT_TYPES.CONTACT_CAPTURED:
      await handleContactCaptured(event);
      return;

    default:
      // الأنواع التي لا مستهلك لها بعد تُوسم منجزة لا معلّقة: تركها
      // pending يجعل كل دورة تعيد التقاطها إلى الأبد.
      logger.debug({ type: event.event_type }, 'حدث بلا مستهلك — يُتخطى');
  }
}

/**
 * جهة اتصال جديدة: رسالة شكر للزائر وإشعار لصاحب البطاقة (§8.2).
 *
 * الحمولة معرّفات فقط، والبيانات الشخصية تُقرأ هنا من داخل سياق
 * مؤسستها ثم تذهب إلى الطابور — فلا تبقى في جدول الأحداث.
 */
async function handleContactCaptured(event: ClaimedEvent): Promise<void> {
  const organizationId = event.organization_id;
  const contactId = asId(event.payload.contactId);
  const ownerUserId = asId(event.payload.ownerUserId);

  if (!organizationId || !contactId) {
    throw new Error('حمولة contact.captured ناقصة');
  }

  const contact = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.contact.findFirst({
      where: { id: contactId },
      select: {
        fullName: true,
        email: true,
        locale: true,
        card: { select: { slug: true, localizations: { select: { locale: true, fullName: true } } } },
      },
    }),
  );

  if (!contact) {
    // حُذف الصف قبل معالجة الحدث — ليس فشلاً، فلا نعيد المحاولة.
    logger.warn({ contactId }, 'جهة الاتصال غير موجودة — يُتخطى الحدث');
    return;
  }

  const locale = contact.locale === 'en' ? 'en' : 'ar';
  const ownerName =
    contact.card?.localizations.find((entry) => entry.locale === locale)?.fullName ??
    contact.card?.localizations[0]?.fullName ??
    '';

  // ---- إشعار صاحب البطاقة ----
  if (ownerUserId) {
    const owner = await prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { email: true, locale: true, deletedAt: true },
    });

    if (owner && !owner.deletedAt) {
      await enqueueEmail({
        to: owner.email,
        template: EMAIL_TEMPLATES.CONTACT_CAPTURED,
        locale: owner.locale === 'en' ? 'en' : 'ar',
        variables: { contactName: contact.fullName },
        organizationId,
        idempotencyKey: idempotencyKeyFrom('contact-captured', contactId),
      });
    }
  }

  // ---- رسالة الشكر الآلية ----
  //
  // مشروطة ببريد الزائر: النموذج قد يجمع الهاتف وحده، ولا نرسل رسالة
  // شكر عبر قناة لم يمنحها.
  if (contact.email) {
    await enqueueEmail({
      to: contact.email,
      template: EMAIL_TEMPLATES.CONTACT_THANK_YOU,
      locale,
      variables: { contactName: contact.fullName, ownerName },
      organizationId,
      idempotencyKey: idempotencyKeyFrom('contact-thanks', contactId),
    });
  }
}

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
