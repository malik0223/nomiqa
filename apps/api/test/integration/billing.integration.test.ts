import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { admin, app, asOrganization, createTenant, disconnectAll, resetData } from './helpers.js';

/**
 * عزل الفوترة والدعم (§9.4 و§9.5).
 *
 * الفواتير والمدفوعات مستندات محاسبية: تسريب فاتورة يكشف حجم عمل
 * منافس وسعره المتفاوض عليه. الباقات والأسعار وأكواد الخصم بلا عزل
 * **عمداً** — كتالوج عام تقرؤه كل مؤسسة، والاختبارات هنا تثبّت هذا
 * التمييز حتى لا يُقلب لاحقاً بلا قصد.
 */
describe('عزل الفوترة', () => {
  let orgA: Awaited<ReturnType<typeof createTenant>>;
  let orgB: Awaited<ReturnType<typeof createTenant>>;
  let planId: string;
  let invoiceA: string;

  beforeAll(async () => {
    await resetData();
  });

  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  beforeEach(async () => {
    await resetData();
    orgA = await createTenant('billing-a');
    orgB = await createTenant('billing-b');

    const plan = await admin.plan.create({
      data: {
        key: `business-${Date.now()}`,
        name: 'الفرق',
        limits: { maxCards: 100, maxMembers: 100, maxDepartments: 25, maxBranches: 25, maxContacts: 1000 },
        features: ['team_management'],
      },
    });
    planId = plan.id;

    await admin.subscription.create({
      data: {
        organizationId: orgA.organizationId,
        planId,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    const invoice = await admin.invoice.create({
      data: {
        organizationId: orgA.organizationId,
        number: `NOM-TEST-${Date.now()}`,
        status: 'open',
        subtotalBaisa: 5_000,
        vatBaisa: 250,
        totalBaisa: 5_250,
        issuedAt: new Date(),
        lines: {
          create: {
            organizationId: orgA.organizationId,
            description: 'اشتراك',
            quantity: 1,
            unitAmountBaisa: 5_000,
            amountBaisa: 5_000,
          },
        },
      },
    });
    invoiceA = invoice.id;
  });

  it('لا تقرأ المؤسسة اشتراك غيرها', async () => {
    const seen = await asOrganization(orgB.organizationId, (tx) => tx.subscription.findMany());
    expect(seen).toHaveLength(0);
  });

  it('لا تقرأ المؤسسة فواتير غيرها ولا بنودها', async () => {
    const seen = await asOrganization(orgB.organizationId, async (tx) => ({
      invoices: await tx.invoice.findMany(),
      lines: await tx.invoiceLine.findMany(),
    }));

    expect(seen.invoices).toHaveLength(0);
    expect(seen.lines).toHaveLength(0);
  });

  it('تقرأ المؤسسة فاتورتها هي', async () => {
    const seen = await asOrganization(orgA.organizationId, (tx) => tx.invoice.findMany());

    expect(seen).toHaveLength(1);
    expect(seen[0]?.id).toBe(invoiceA);
  });

  /**
   * الحالة الأخطر مالياً: مؤسسة تسدّد فاتورة مؤسسة أخرى — أو تُعلن
   * فاتورتها مسدَّدة بلا دفع.
   */
  it('لا تعدّل المؤسسة فاتورة غيرها ولو عرفت معرّفها', async () => {
    const updated = await asOrganization(orgB.organizationId, (tx) =>
      tx.invoice.updateMany({
        where: { id: invoiceA },
        data: { status: 'paid', paidAt: new Date() },
      }),
    );

    expect(updated.count).toBe(0);

    const untouched = await admin.invoice.findUnique({ where: { id: invoiceA } });
    expect(untouched?.status).toBe('open');
    expect(untouched?.paidAt).toBeNull();
  });

  it('ترفض السياسة إنشاء دفعة في مؤسسة أخرى', async () => {
    await expect(
      asOrganization(orgB.organizationId, (tx) =>
        tx.payment.create({
          data: {
            organizationId: orgA.organizationId,
            invoiceId: invoiceA,
            clientReferenceId: `ref-${Date.now()}`,
            amountBaisa: 5_250,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  /**
   * الكتالوج مشترك بالتصميم.
   *
   * لو أُضيف RLS إلى `plans` مستقبلاً لانكسرت صفحة الأسعار بصمت،
   * فيثبّت هذا الاختبار القرار بدل تركه ضمنياً.
   */
  it('تقرأ كل مؤسسة كتالوج الباقات', async () => {
    const seen = await asOrganization(orgB.organizationId, (tx) => tx.plan.findMany());

    expect(seen.some((plan) => plan.id === planId)).toBe(true);
  });

  it('يمنع الفريد إصدار رقم فاتورة مكرر', async () => {
    const first = await app.$queryRaw<
      Array<{ next_invoice_number: string }>
    >`SELECT next_invoice_number()`;
    const second = await app.$queryRaw<
      Array<{ next_invoice_number: string }>
    >`SELECT next_invoice_number()`;

    expect(first[0]?.next_invoice_number).not.toBe(second[0]?.next_invoice_number);
  });

  /** دالة النداء الراجع تترجم مرجعاً إلى مؤسسته بلا سياق. */
  it('تُرجع دالة المرجع وجهة الدفعة بلا سياق مؤسسة', async () => {
    const reference = `ref-${Date.now()}`;

    await admin.payment.create({
      data: {
        organizationId: orgA.organizationId,
        invoiceId: invoiceA,
        clientReferenceId: reference,
        amountBaisa: 5_250,
      },
    });

    const rows = await app.$queryRaw<
      Array<{ organization_id: string; status: string }>
    >`SELECT * FROM payment_target_by_reference(${reference})`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.organization_id).toBe(orgA.organizationId);
    expect(rows[0]?.status).toBe('pending');
  });
});

describe('عزل الدعم', () => {
  let orgA: Awaited<ReturnType<typeof createTenant>>;
  let orgB: Awaited<ReturnType<typeof createTenant>>;
  let ticketA: string;

  beforeAll(async () => {
    await resetData();
  });

  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  beforeEach(async () => {
    await resetData();
    orgA = await createTenant('support-a');
    orgB = await createTenant('support-b');

    const ticket = await admin.supportTicket.create({
      data: {
        organizationId: orgA.organizationId,
        createdByUserId: orgA.userId,
        subject: 'مشكلة في النشر',
        messages: {
          create: {
            organizationId: orgA.organizationId,
            authorUserId: orgA.userId,
            authorType: 'customer',
            body: 'تفاصيل خاصة بالمؤسسة',
          },
        },
      },
    });
    ticketA = ticket.id;
  });

  it('لا تقرأ المؤسسة تذاكر غيرها ولا رسائلها', async () => {
    const seen = await asOrganization(orgB.organizationId, async (tx) => ({
      tickets: await tx.supportTicket.findMany(),
      messages: await tx.supportMessage.findMany(),
    }));

    expect(seen.tickets).toHaveLength(0);
    expect(seen.messages).toHaveLength(0);
  });

  /**
   * ردّ فريق المنصة يكتب في مؤسسة التذكرة بلا سياق RLS — وهذا
   * الاستثناء المعلن الوحيد. الاختبار يثبّت أنه يكتب في المؤسسة
   * **الصحيحة** لا في أي مؤسسة.
   */
  it('يكتب ردّ المنصة في مؤسسة التذكرة نفسها', async () => {
    await app.$queryRaw`
      SELECT admin_reply_to_ticket(
        ${ticketA}::uuid,
        ${orgA.userId}::uuid,
        'رد فريق الدعم',
        false
      )
    `;

    const messages = await admin.supportMessage.findMany({ where: { ticketId: ticketA } });
    const platformReply = messages.find((message) => message.authorType === 'platform');

    expect(platformReply).toBeDefined();
    expect(platformReply?.organizationId).toBe(orgA.organizationId);

    const ticket = await admin.supportTicket.findUnique({ where: { id: ticketA } });
    expect(ticket?.status).toBe('pending_customer');
    expect(ticket?.firstResponseAt).not.toBeNull();
  });

  /** الملاحظة الداخلية لا تغيّر حالة التذكرة ولا تُحسب رداً أولاً. */
  it('الملاحظة الداخلية لا تغيّر حالة التذكرة', async () => {
    await app.$queryRaw`
      SELECT admin_reply_to_ticket(${ticketA}::uuid, ${orgA.userId}::uuid, 'ملاحظة داخلية', true)
    `;

    const ticket = await admin.supportTicket.findUnique({ where: { id: ticketA } });
    expect(ticket?.status).toBe('open');
    expect(ticket?.firstResponseAt).toBeNull();
  });
});
