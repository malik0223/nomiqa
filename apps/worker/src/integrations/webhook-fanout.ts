import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from '@nomiqa/contracts';
import { getPrismaClient, withRlsContext, type Prisma } from '@nomiqa/database';
import { createLogger } from '@nomiqa/observability';

const prisma = getPrismaClient();
const logger = createLogger('webhooks');

/**
 * تحويل حدث Outbox إلى تسليمات Webhook (§11.4).
 *
 * يعيش على مسار الـOutbox لا بجانبه: الحدث كُتب في معاملة الصف نفسه،
 * فمن قرأه هناك قرأ واقعةً وقعت فعلاً. إنشاء تسليم من مكان آخر — عند
 * الكتابة مثلاً — كان يبثّ إلى العالم حدثاً قد تتراجع معاملته.
 *
 * والحمولة تُبنى **داخل سياق المؤسسة**: حدث الـOutbox يحمل معرّفات
 * فقط (قاعدة أرستها المرحلة 3 لئلا تمر بيانات شخصية عبر Redis)، وما
 * يحتاجه نظام العميل هو الحقول نفسها. تُقرأ هنا وتُكتب في صف التسليم
 * الذي يعيش دقائق حتى يُسلَّم.
 */

interface OutboxEventRow {
  id: string;
  organization_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
}

const SUBSCRIBABLE = new Set<string>(WEBHOOK_EVENT_TYPES);

export async function fanoutWebhooks(event: OutboxEventRow): Promise<void> {
  const organizationId = event.organization_id;

  if (!organizationId || !SUBSCRIBABLE.has(event.event_type)) {
    return;
  }

  const eventType = event.event_type as WebhookEventType;

  const endpoints = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.webhookEndpoint.findMany({
      where: { isActive: true, disabledAt: null, eventTypes: { has: eventType } },
      select: { id: true },
    }),
  );

  if (endpoints.length === 0) {
    return;
  }

  const payload = await buildPayload(organizationId, eventType, event.payload);

  if (!payload) {
    logger.warn({ eventId: event.id, eventType }, 'تعذّر بناء حمولة الحدث — لا تسليم');
    return;
  }

  await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.webhookDelivery.createMany({
      data: endpoints.map((endpoint) => ({
        organizationId,
        endpointId: endpoint.id,
        eventType,
        eventId: event.id,
        payload: payload as Prisma.InputJsonValue,
        status: 'pending',
        nextAttemptAt: new Date(),
      })),
      // الفريد على (وجهة، حدث) يجعل إعادة تشغيل المرسل بلا أثر: حدث
      // عُولج جزئياً ثم أُعيد لا يُنتج نداءً ثانياً عند العميل.
      skipDuplicates: true,
    }),
  );

  logger.debug({ eventType, endpoints: endpoints.length }, 'أُدرجت تسليمات Webhook');
}

/**
 * حمولة الحدث كما يراها العميل.
 *
 * حقول صريحة لا تمرير لصف: عمود يُضاف إلى `contacts` غداً لا يجوز أن
 * يظهر في تكامل عميل بلا قرار — ولا أن يظهر فيه حقل `message`، وهو
 * نصٌّ كتبه زائر لصاحب البطاقة وحده.
 */
async function buildPayload(
  organizationId: string,
  eventType: WebhookEventType,
  source: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  switch (eventType) {
    case 'contact.captured': {
      const contactId = asId(source.contactId);
      if (!contactId) return null;

      const contact = await withRlsContext(prisma, { organizationId }, (tx) =>
        tx.contact.findFirst({
          where: { id: contactId },
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            organizationName: true,
            jobTitle: true,
            source: true,
            eventId: true,
            qualifiers: true,
            duplicateOfId: true,
            capturedAt: true,
            card: { select: { id: true, slug: true } },
          },
        }),
      );

      if (!contact) return null;

      return {
        id: contact.id,
        fullName: contact.fullName,
        email: contact.email,
        phone: contact.phone,
        organizationName: contact.organizationName,
        jobTitle: contact.jobTitle,
        source: contact.source,
        eventId: contact.eventId,
        qualifiers: contact.qualifiers ?? {},
        isDuplicate: contact.duplicateOfId !== null,
        cardId: contact.card?.id ?? null,
        cardSlug: contact.card?.slug ?? null,
        capturedAt: contact.capturedAt.toISOString(),
      };
    }

    case 'card.published': {
      const cardId = asId(source.cardId);
      if (!cardId) return null;

      const card = await withRlsContext(prisma, { organizationId }, (tx) =>
        tx.card.findFirst({
          where: { id: cardId },
          select: {
            id: true,
            slug: true,
            status: true,
            publishedAt: true,
            localizations: { select: { locale: true, fullName: true, jobTitle: true } },
          },
        }),
      );

      if (!card) return null;

      return {
        id: card.id,
        slug: card.slug,
        status: card.status,
        publishedAt: card.publishedAt?.toISOString() ?? null,
        localizations: card.localizations,
      };
    }

    case 'invoice.paid': {
      const invoiceId = asId(source.invoiceId);
      if (!invoiceId) return null;

      const invoice = await withRlsContext(prisma, { organizationId }, (tx) =>
        tx.invoice.findFirst({
          where: { id: invoiceId },
          select: {
            id: true,
            number: true,
            status: true,
            totalBaisa: true,
            currency: true,
            issuedAt: true,
          },
        }),
      );

      if (!invoice) return null;

      return {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        // بالبيسة كما تُخزَّن: القسمة على ألف قبل الإرسال تُدخل عدداً
        // عشرياً في عقد منشور، وهو أول باب لخطأ تقريب عند العميل.
        totalBaisa: invoice.totalBaisa,
        currency: invoice.currency,
        issuedAt: invoice.issuedAt?.toISOString() ?? null,
      };
    }

    case 'subscription.activated':
    case 'subscription.canceled': {
      const subscription = await withRlsContext(prisma, { organizationId }, (tx) =>
        tx.subscription.findFirst({
          where: { organizationId },
          select: {
            id: true,
            status: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            plan: { select: { key: true, name: true } },
          },
        }),
      );

      if (!subscription) return null;

      return {
        id: subscription.id,
        status: subscription.status,
        planKey: subscription.plan.key,
        planName: subscription.plan.name,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      };
    }

    default:
      return null;
  }
}

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
