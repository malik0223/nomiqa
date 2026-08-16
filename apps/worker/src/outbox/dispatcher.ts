import { EMAIL_TEMPLATES, OUTBOX_EVENT_TYPES } from '@nomiqa/contracts';
import { Prisma, getPrismaClient, withRlsContext } from '@nomiqa/database';
import { createLogger } from '@nomiqa/observability';
import { enqueueEmail, idempotencyKeyFrom } from '../email/producer.js';
import { queueCrmSync } from '../integrations/crm-sync.js';
import { fanoutWebhooks } from '../integrations/webhook-fanout.js';

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
  // `::int` إلزامي: Prisma ترسل أعداد JavaScript كـbigint، ولا يطابق
  // ذلك دالة معرّفة بـint فيفشل الاستدعاء بـ«لا دالة بهذا الاسم».
  const events = await prisma.$queryRaw<ClaimedEvent[]>`
    SELECT * FROM outbox_claim_batch(${BATCH_SIZE}::int)
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
        SELECT outbox_mark_failed(${event.id}::uuid, ${message}, ${MAX_ATTEMPTS}::int)
      `;
    }
  }

  return events.length;
}

async function handleEvent(event: ClaimedEvent): Promise<void> {
  // بثّ الحدث إلى وجهات المؤسسة **قبل** أثره الداخلي (§11.4).
  //
  // الترتيب مقصود: البثّ لا ينشئ نداءً خارجياً هنا بل صفَّ تسليم،
  // فكلفته قريبة من الصفر. ووضعه بعد إرسال البريد كان يعني أن فشل
  // مزوّد البريد يمنع وصول الحدث إلى نظام العميل — وهما لا علاقة
  // بينهما.
  await fanoutWebhooks(event);

  switch (event.event_type) {
    case OUTBOX_EVENT_TYPES.CONTACT_CAPTURED:
      await handleContactCaptured(event);
      return;

    case OUTBOX_EVENT_TYPES.EVENT_ENDED:
      await handleEventEnded(event);
      return;

    case OUTBOX_EVENT_TYPES.MEMBER_INVITED:
      await handleMemberInvited(event);
      return;

    case OUTBOX_EVENT_TYPES.CHANGE_REQUEST_SUBMITTED:
      await handleChangeRequestSubmitted(event);
      return;

    case OUTBOX_EVENT_TYPES.CHANGE_REQUEST_REVIEWED:
      await handleChangeRequestReviewed(event);
      return;

    case OUTBOX_EVENT_TYPES.INVOICE_ISSUED:
      await handleInvoiceIssued(event);
      return;

    case OUTBOX_EVENT_TYPES.INVOICE_PAID:
      await handleInvoicePaid(event);
      return;

    case OUTBOX_EVENT_TYPES.ORGANIZATION_SUSPENDED:
      await handleOrganizationSuspended(event);
      return;

    default:
      // الأنواع التي لا مستهلك لها بعد تُوسم منجزة لا معلّقة: تركها
      // pending يجعل كل دورة تعيد التقاطها إلى الأبد.
      logger.debug({ type: event.event_type }, 'حدث بلا مستهلك — يُتخطى');
  }
}

/**
 * دعوة موظف (§9.2).
 *
 * الرمز يعيش في حمولة الحدث لا في الجدول: الجدول يحفظ تجزئته وحدها،
 * والمرسل يحتاج الرمز الصريح ليبني الرابط. الحدث يُوسم `processed`
 * بعد الإرسال وتمسحه دورة تنظيف الـoutbox، فلا يبقى الرمز مقروءاً.
 */
async function handleMemberInvited(event: ClaimedEvent): Promise<void> {
  const organizationId = event.organization_id;
  const token = asId(event.payload.token);
  const email = asId(event.payload.email);

  if (!organizationId || !token || !email) {
    throw new Error('حمولة member.invited ناقصة');
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  await enqueueEmail({
    to: email,
    template: EMAIL_TEMPLATES.ORGANIZATION_INVITE,
    locale: event.payload.locale === 'en' ? 'en' : 'ar',
    variables: {
      organizationName: organization?.name ?? '',
      inviteUrl: `${appBaseUrl()}/invitations/${token}`,
    },
    organizationId,
    idempotencyKey: idempotencyKeyFrom('invite', asId(event.payload.invitationId) ?? token),
  });
}

/**
 * طلب تعديل جديد (§9.3).
 *
 * يُرسل إلى أصحاب `cards:approve` **على المؤسسة** فقط. المفوَّضون على
 * إدارة بعينها يحتاجون تصفيةً بموقع مالك البطاقة، وإرسال الطلب إلى
 * كل مفوَّض كان سيُعلم مسؤول إدارة بتعديلات إدارة أخرى.
 */
async function handleChangeRequestSubmitted(event: ClaimedEvent): Promise<void> {
  const organizationId = event.organization_id;
  const requestId = asId(event.payload.requestId);

  if (!organizationId || !requestId) {
    throw new Error('حمولة change_request.submitted ناقصة');
  }

  const request = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.cardChangeRequest.findFirst({
      where: { id: requestId },
      select: { payload: true, requestedByUserId: true },
    }),
  );

  if (!request) {
    logger.warn({ requestId }, 'الطلب غير موجود — يُتخطى الحدث');
    return;
  }

  const [requester, reviewers] = await Promise.all([
    prisma.user.findUnique({
      where: { id: request.requestedByUserId },
      select: { fullName: true },
    }),
    withRlsContext(prisma, { organizationId }, (tx) =>
      tx.organizationMembership.findMany({
        where: {
          status: 'active',
          revokedAt: null,
          roles: {
            some: {
              role: { permissions: { some: { permission: { key: 'cards:approve' } } } },
            },
          },
        },
        include: { user: { select: { email: true, locale: true, deletedAt: true } } },
      }),
    ),
  ]);

  const fields = Object.keys((request.payload as Record<string, unknown>) ?? {})
    .filter((key) => key !== 'revision')
    .join('، ');

  for (const reviewer of reviewers) {
    if (reviewer.user.deletedAt) {
      continue;
    }

    await enqueueEmail({
      to: reviewer.user.email,
      template: EMAIL_TEMPLATES.CHANGE_REQUEST_SUBMITTED,
      locale: reviewer.user.locale === 'en' ? 'en' : 'ar',
      variables: {
        requesterName: requester?.fullName ?? '',
        fields,
        reviewUrl: `${appBaseUrl()}/approvals/${requestId}`,
      },
      organizationId,
      idempotencyKey: idempotencyKeyFrom('cr-submitted', `${requestId}:${reviewer.userId}`),
    });
  }
}

/** نتيجة المراجعة تصل إلى مقدّم الطلب وحده. */
async function handleChangeRequestReviewed(event: ClaimedEvent): Promise<void> {
  const organizationId = event.organization_id;
  const requestId = asId(event.payload.requestId);
  const status = asId(event.payload.status);

  if (!organizationId || !requestId || !status) {
    throw new Error('حمولة change_request.reviewed ناقصة');
  }

  const request = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.cardChangeRequest.findFirst({
      where: { id: requestId },
      select: { requestedByUserId: true, reviewNote: true, card: { select: { id: true } } },
    }),
  );

  if (!request) {
    return;
  }

  const requester = await prisma.user.findUnique({
    where: { id: request.requestedByUserId },
    select: { email: true, locale: true, deletedAt: true },
  });

  if (!requester || requester.deletedAt) {
    return;
  }

  await enqueueEmail({
    to: requester.email,
    template: EMAIL_TEMPLATES.CHANGE_REQUEST_REVIEWED,
    locale: requester.locale === 'en' ? 'en' : 'ar',
    variables: {
      status,
      note: request.reviewNote ?? '',
      cardUrl: `${appBaseUrl()}/cards/${request.card.id}`,
    },
    organizationId,
    idempotencyKey: idempotencyKeyFrom('cr-reviewed', `${requestId}:${status}`),
  });
}

/** فاتورة صدرت (§9.4). تذهب إلى بريد الفوترة أو المالك. */
async function handleInvoiceIssued(event: ClaimedEvent): Promise<void> {
  const organizationId = event.organization_id;
  const invoiceId = asId(event.payload.invoiceId);

  if (!organizationId || !invoiceId) {
    throw new Error('حمولة invoice.issued ناقصة');
  }

  const invoice = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.invoice.findFirst({ where: { id: invoiceId } }),
  );

  // فاتورة بصفر تُصدَر مسدَّدة (تجربة أو خصم كامل) — لا مطالبة تُرسل.
  if (!invoice || invoice.totalBaisa === 0) {
    return;
  }

  const recipient = await billingRecipient(organizationId);
  if (!recipient) {
    return;
  }

  await enqueueEmail({
    to: recipient.email,
    template: EMAIL_TEMPLATES.INVOICE_ISSUED,
    locale: recipient.locale,
    variables: {
      number: invoice.number,
      amount: formatOmr(invoice.totalBaisa),
      dueAt: invoice.dueAt?.toISOString().slice(0, 10) ?? '',
      payUrl: `${appBaseUrl()}/billing/invoices/${invoiceId}`,
    },
    organizationId,
    idempotencyKey: idempotencyKeyFrom('invoice-issued', invoiceId),
  });
}

async function handleInvoicePaid(event: ClaimedEvent): Promise<void> {
  const organizationId = event.organization_id;
  const invoiceId = asId(event.payload.invoiceId);

  if (!organizationId || !invoiceId) {
    throw new Error('حمولة invoice.paid ناقصة');
  }

  const invoice = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.invoice.findFirst({ where: { id: invoiceId } }),
  );

  if (!invoice) {
    return;
  }

  const recipient = await billingRecipient(organizationId);
  if (!recipient) {
    return;
  }

  await enqueueEmail({
    to: recipient.email,
    template: EMAIL_TEMPLATES.INVOICE_PAID,
    locale: recipient.locale,
    variables: {
      number: invoice.number,
      amount: formatOmr(invoice.totalBaisa),
      invoiceUrl: `${appBaseUrl()}/billing/invoices/${invoiceId}`,
    },
    organizationId,
    idempotencyKey: idempotencyKeyFrom('invoice-paid', invoiceId),
  });
}

/** تعليق الحساب (§9.5) — يصل إلى المالك حصراً. */
async function handleOrganizationSuspended(event: ClaimedEvent): Promise<void> {
  const organizationId = event.organization_id;

  if (!organizationId) {
    throw new Error('حمولة organization.suspended ناقصة');
  }

  const recipient = await billingRecipient(organizationId);
  if (!recipient) {
    return;
  }

  await enqueueEmail({
    to: recipient.email,
    template: EMAIL_TEMPLATES.ORGANIZATION_SUSPENDED,
    locale: recipient.locale,
    variables: {
      reason: typeof event.payload.reason === 'string' ? event.payload.reason : '',
      supportUrl: `${appBaseUrl()}/support`,
    },
    organizationId,
    idempotencyKey: idempotencyKeyFrom('org-suspended', `${organizationId}:${event.id}`),
  });
}

/**
 * تقرير ما بعد الفعالية (§11.3).
 *
 * يصل إلى أصحاب `events:manage` **على المؤسسة** وحدهم: التقرير يقارن
 * أداء أعضاء الفريق بالاسم، وإرساله إلى كل من شارك في المعرض يجعل كل
 * مندوب يقرأ ترتيبه بين زملائه في بريد لم يطلبه.
 */
async function handleEventEnded(event: ClaimedEvent): Promise<void> {
  const organizationId = event.organization_id;
  const eventId = asId(event.payload.eventId);

  if (!organizationId || !eventId) {
    throw new Error('حمولة event.ended ناقصة');
  }

  const record = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.event.findFirst({ where: { id: eventId }, select: { name: true } }),
  );

  if (!record) {
    logger.warn({ eventId }, 'الفعالية غير موجودة — يُتخطى الحدث');
    return;
  }

  // المؤهَّلون يُحسبون هنا لا في مُنشئ الحدث: الحمولة تحمل معرّفات
  // وعدداً واحداً، والأرقام التفصيلية تُقرأ من داخل سياق المؤسسة.
  const [leads, qualified] = await withRlsContext(prisma, { organizationId }, async (tx) => [
    await tx.contact.count({ where: { eventId, deletedAt: null } }),
    await tx.contact.count({
      where: { eventId, deletedAt: null, NOT: { qualifiers: { equals: Prisma.DbNull } } },
    }),
  ]);

  const recipients = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.organizationMembership.findMany({
      where: {
        status: 'active',
        revokedAt: null,
        roles: {
          some: { role: { permissions: { some: { permission: { key: 'events:manage' } } } } },
        },
      },
      include: { user: { select: { email: true, locale: true, deletedAt: true } } },
    }),
  );

  for (const recipient of recipients) {
    if (recipient.user.deletedAt) continue;

    await enqueueEmail({
      to: recipient.user.email,
      template: EMAIL_TEMPLATES.EVENT_REPORT,
      locale: recipient.user.locale === 'en' ? 'en' : 'ar',
      variables: {
        eventName: record.name,
        leads: String(leads),
        qualifiedLeads: String(qualified),
        reportUrl: `${appBaseUrl()}/events/${eventId}`,
      },
      organizationId,
      idempotencyKey: idempotencyKeyFrom('event-report', `${eventId}:${recipient.userId}`),
    });
  }
}

/**
 * مستلم رسائل الفوترة والحساب.
 *
 * بريد الفوترة المُعلَن أولاً، ثم مالك المؤسسة. إرسال إشعار مالي أو
 * إشعار تعليق إلى كل الأعضاء تسريبٌ لمعلومة داخل المؤسسة نفسها.
 */
async function billingRecipient(
  organizationId: string,
): Promise<{ email: string; locale: 'ar' | 'en' } | null> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { billingEmail: true, defaultLocale: true },
  });

  if (organization?.billingEmail) {
    return {
      email: organization.billingEmail,
      locale: organization.defaultLocale === 'en' ? 'en' : 'ar',
    };
  }

  const owner = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.organizationMembership.findFirst({
      where: {
        status: 'active',
        revokedAt: null,
        roles: { some: { role: { key: 'owner' } } },
      },
      include: { user: { select: { email: true, locale: true, deletedAt: true } } },
    }),
  );

  if (!owner || owner.user.deletedAt) {
    logger.warn({ organizationId }, 'لا مستلم لرسائل الحساب');
    return null;
  }

  return { email: owner.user.email, locale: owner.user.locale === 'en' ? 'en' : 'ar' };
}

function formatOmr(baisa: number): string {
  return `${Math.floor(baisa / 1000)}.${String(baisa % 1000).padStart(3, '0')}`;
}

function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return url.endsWith('/') ? url.slice(0, -1) : url;
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
        card: {
          select: { slug: true, localizations: { select: { locale: true, fullName: true } } },
        },
      },
    }),
  );

  if (!contact) {
    // حُذف الصف قبل معالجة الحدث — ليس فشلاً، فلا نعيد المحاولة.
    logger.warn({ contactId }, 'جهة الاتصال غير موجودة — يُتخطى الحدث');
    return;
  }

  // المزامنة تُجدول قبل أي بريد: العميل المحتمل يجب أن يصل الـCRM في
  // دقائق — وهو الفارق بين متابعة ساخنة ومكالمة بعد أسبوع (§11.5).
  await queueCrmSync(organizationId, contactId);

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
