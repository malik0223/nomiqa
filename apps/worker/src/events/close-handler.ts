import { OUTBOX_EVENT_TYPES } from '@nomiqa/contracts';
import { getPrismaClient } from '@nomiqa/database';
import { createLogger } from '@nomiqa/observability';

const prisma = getPrismaClient();
const logger = createLogger('events');

/**
 * مهلة بعد نهاية الفعالية قبل إرسال تقريرها.
 *
 * ست ساعات لا صفر: المندوب في المعرض يراجع آخر البطاقات الممسوحة بعد
 * إغلاق القاعة، أحياناً في الفندق مساءً. تقرير يصل لحظة انتهاء الوقت
 * المعلن ينقصه عملاء ما زالوا في شاشة المراجعة — ويُقرأ على أنه أرقام
 * الفعالية النهائية.
 */
const REPORT_DELAY_HOURS = 6;

/**
 * إغلاق الفعاليات المنتهية (§11.3 — تقارير ما بعد الفعالية).
 *
 * الحدث لا الرسالة: نكتب `event.ended` في الـOutbox ويتولى مرسله
 * تحويله إلى بريد. الفصل هو نفسه سبب وجود الـOutbox منذ المرحلة 3 —
 * ولأن `event.ended` حدث قابل للاشتراك، فوصول تقرير الفعالية إلى
 * نظام العميل يصير مسألة إعداد لا شيفرة.
 *
 * `report_sent_at` يجعل الدورة Idempotent: تشغيلها كل ساعة لا يُنتج
 * إلا حدثاً واحداً لكل فعالية مهما تكرر.
 */
export async function closeEndedEvents(): Promise<number> {
  const threshold = new Date(Date.now() - REPORT_DELAY_HOURS * 3_600_000);

  const events = await prisma.event.findMany({
    where: { endsAt: { lte: threshold }, reportSentAt: null },
    select: { id: true, organizationId: true, name: true },
    take: 50,
  });

  for (const event of events) {
    // التحديث الشرطي أولاً: نسختان من الـWorker قد تقرآن القائمة
    // نفسها، و`updateMany` بشرط `reportSentAt: null` تجعل واحدة منهما
    // فقط تكتب الحدث.
    const claimed = await prisma.event.updateMany({
      where: { id: event.id, reportSentAt: null },
      data: { reportSentAt: new Date() },
    });

    if (claimed.count === 0) continue;

    const leads = await prisma.contact.count({
      where: { eventId: event.id, deletedAt: null },
    });

    await prisma.outboxEvent.create({
      data: {
        organizationId: event.organizationId,
        eventType: OUTBOX_EVENT_TYPES.EVENT_ENDED,
        // معرّفات وعدد فقط — لا اسم عميل ولا بريده يمر في حمولة حدث.
        payload: { eventId: event.id, leads },
      },
    });

    logger.info({ eventId: event.id, leads }, 'أُغلقت فعالية وأُدرج تقريرها');
  }

  return events.length;
}
