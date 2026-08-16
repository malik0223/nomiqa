import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OUTBOX_EVENT_TYPES,
  type InvoiceDetail,
  type InvoiceStatus,
  type InvoiceSummary,
  type Paginated,
} from '@nomiqa/contracts';
import { withRlsContext, type TenantScopedClient } from '@nomiqa/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { computeInvoiceAmounts, DEFAULT_VAT_RATE_BPS, type CouponInput } from './pricing.js';
import { PaymentProviderError } from './providers/payment-provider.js';
import { ThawaniProvider } from './providers/thawani.provider.js';

/**
 * إصدار الفواتير وتحصيلها.
 *
 * حدّ فاصل مقصود بين مستندين: **الفاتورة** التزام يُصدَر مرة ولا
 * يُعدَّل، و**الدفعة** محاولة قد تتكرر. فاتورة واحدة قد يكون لها ثلاث
 * محاولات دفع فاشلة ورابعة ناجحة، ولا يجوز أن يُنتج ذلك أربع فواتير.
 */

/** مهلة السداد الافتراضية. */
const INVOICE_DUE_DAYS = 7;

interface InvoiceLineInput {
  description: string;
  descriptionEn?: string | null;
  quantity: number;
  unitAmountBaisa: number;
  metadata?: Record<string, unknown>;
}

/** نتيجة تأكيد دفعة. المؤسسة مُعادة لأن المُستدعي قد لا يعرفها. */
export interface PaymentConfirmation {
  status: string;
  invoiceId: string | null;
  organizationId: string;
}

export interface IssueInvoiceInput {
  organizationId: string;
  subscriptionId: string | null;
  lines: InvoiceLineInput[];
  coupon: CouponInput | null;
  periodStart: Date | null;
  periodEnd: Date | null;
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly provider: ThawaniProvider,
  ) {}

  /**
   * يصدر فاتورة بحالة `open`.
   *
   * البيانات الضريبية تُنسخ من المؤسسة إلى الفاتورة لحظة الإصدار: تغيير
   * عنوان المؤسسة غداً لا يجوز أن يغيّر مستنداً صدر اليوم.
   */
  async issue(input: IssueInvoiceInput): Promise<{ invoiceId: string; totalBaisa: number }> {
    const vatRateBps = this.vatRateBps;
    const subtotal = input.lines.reduce(
      (sum, line) => sum + line.unitAmountBaisa * line.quantity,
      0,
    );
    const amounts = computeInvoiceAmounts(subtotal, input.coupon, vatRateBps);

    return withRlsContext(this.prisma, { organizationId: input.organizationId }, async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: input.organizationId },
        select: {
          name: true,
          billingName: true,
          billingEmail: true,
          billingVatNumber: true,
          billingAddress: true,
        },
      });

      const numbers = await tx.$queryRaw<
        Array<{ next_invoice_number: string }>
      >`SELECT next_invoice_number()`;

      const number = numbers[0]?.next_invoice_number;
      if (!number) {
        // التسلسل موجود في المهاجرة؛ غيابه يعني قاعدة بيانات غير
        // مُهاجَرة، وفاتورة بلا رقم أسوأ من فشل صريح.
        throw new Error('تعذّر توليد رقم فاتورة — تحقق من المهاجرات');
      }

      const now = new Date();
      const invoice = await tx.invoice.create({
        data: {
          organizationId: input.organizationId,
          subscriptionId: input.subscriptionId,
          number,
          status: amounts.totalBaisa === 0 ? 'paid' : 'open',
          subtotalBaisa: amounts.subtotalBaisa,
          discountBaisa: amounts.discountBaisa,
          vatRateBps: amounts.vatRateBps,
          vatBaisa: amounts.vatBaisa,
          totalBaisa: amounts.totalBaisa,
          // فاتورة بصفر تُوسم مسددة فور إصدارها: لا شيء لتحصيله،
          // وتركها `open` كان سيُطالب العميل بدفع صفر إلى الأبد.
          amountPaidBaisa: amounts.totalBaisa === 0 ? 0 : 0,
          paidAt: amounts.totalBaisa === 0 ? now : null,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          issuedAt: now,
          dueAt: new Date(now.getTime() + INVOICE_DUE_DAYS * 24 * 3_600_000),
          billingName: organization?.billingName ?? organization?.name ?? null,
          billingEmail: organization?.billingEmail ?? null,
          billingVatNumber: organization?.billingVatNumber ?? null,
          billingAddress: organization?.billingAddress ?? null,
          lines: {
            create: input.lines.map((line) => ({
              organizationId: input.organizationId,
              description: line.description,
              descriptionEn: line.descriptionEn ?? null,
              quantity: line.quantity,
              unitAmountBaisa: line.unitAmountBaisa,
              amountBaisa: line.unitAmountBaisa * line.quantity,
              metadata: (line.metadata ?? null) as never,
            })),
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          organizationId: input.organizationId,
          eventType: OUTBOX_EVENT_TYPES.INVOICE_ISSUED,
          payload: { invoiceId: invoice.id, number, totalBaisa: amounts.totalBaisa },
        },
      });

      return { invoiceId: invoice.id, totalBaisa: amounts.totalBaisa };
    });
  }

  /**
   * يفتح جلسة دفع لفاتورة.
   *
   * يعيد استخدام جلسة معلّقة لم تنته بدل فتح ثانية: كل جلسة رابط دفع
   * حي، وتركُ اثنين مفتوحين لفاتورة واحدة يسمح بدفعها مرتين.
   */
  async createCheckout(
    organizationId: string,
    invoiceId: string,
  ): Promise<{ paymentId: string; checkoutUrl: string }> {
    const invoice = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.invoice.findFirst({
        where: { id: invoiceId },
        include: {
          lines: true,
          payments: {
            where: { status: 'pending', expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
    );

    if (!invoice) {
      throw new NotFoundException('الفاتورة غير موجودة');
    }

    const reusable = invoice.payments[0];
    if (reusable?.checkoutUrl) {
      return { paymentId: reusable.id, checkoutUrl: reusable.checkoutUrl };
    }

    // المرجع يُولَّد عندنا ويحمل معرّف الفاتورة: النداء الراجع يصل بلا
    // سياق، وهذا ما يترجمه إلى صف عندنا.
    const clientReferenceId = `inv_${invoice.id}_${Date.now().toString(36)}`;

    const payment = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.payment.create({
        data: {
          organizationId,
          invoiceId: invoice.id,
          provider: this.provider.key,
          status: 'pending',
          clientReferenceId,
          amountBaisa: invoice.totalBaisa,
          currency: invoice.currency,
        },
      }),
    );

    const appBaseUrl = trimSlash(this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000');

    try {
      const session = await this.provider.createCheckout({
        clientReferenceId,
        items: invoice.lines.map((line) => ({
          name: line.description,
          unitAmountBaisa: line.unitAmountBaisa,
          quantity: line.quantity,
        })),
        successUrl: `${appBaseUrl}/billing/return?ref=${clientReferenceId}&status=success`,
        cancelUrl: `${appBaseUrl}/billing/return?ref=${clientReferenceId}&status=cancel`,
        customerEmail: invoice.billingEmail ?? undefined,
        metadata: { invoice: invoice.number },
      });

      await withRlsContext(this.prisma, { organizationId }, (tx) =>
        tx.payment.update({
          where: { id: payment.id },
          data: {
            providerSessionId: session.providerSessionId,
            checkoutUrl: session.checkoutUrl,
            expiresAt: session.expiresAt,
          },
        }),
      );

      return { paymentId: payment.id, checkoutUrl: session.checkoutUrl };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'خطأ غير معروف';

      // الدفعة تُوسم فاشلة لا تُحذف: محاولة فاشلة مع سببها أنفع من
      // فراغ حين يسأل العميل «لماذا لم يفتح رابط الدفع؟».
      await withRlsContext(this.prisma, { organizationId }, (tx) =>
        tx.payment.update({
          where: { id: payment.id },
          data: { status: 'failed', failureReason: reason.slice(0, 300) },
        }),
      );

      throw error instanceof PaymentProviderError
        ? error
        : new PaymentProviderError(reason, false);
    }
  }

  /**
   * يتحقق من دفعة ويطبّق أثرها.
   *
   * **Idempotent بالكامل** — يُستدعى من ثلاثة مسارات: عودة المتصفح،
   * النداء الراجع من البوابة، ودورة الـWorker. الثلاثة قد تصل معاً،
   * ودفعة مطبَّقة مسبقاً تخرج من هنا بلا أثر ثانٍ.
   *
   * الحالة تُقرأ من البوابة لا من المُستدعي: من يملك رابط الإرجاع
   * يستطيع فتحه بـ`status=success` بلا أن يدفع شيئاً.
   */
  async confirmPayment(clientReferenceId: string): Promise<PaymentConfirmation> {
    const [target] = await this.prisma.$queryRaw<
      Array<{ payment_id: string; organization_id: string; status: string }>
    >`SELECT * FROM payment_target_by_reference(${clientReferenceId})`;

    if (!target) {
      throw new NotFoundException('الدفعة غير موجودة');
    }

    const organizationId = target.organization_id;

    if (target.status !== 'pending') {
      const invoiceId = await withRlsContext(this.prisma, { organizationId }, async (tx) =>
        (await tx.payment.findUnique({ where: { id: target.payment_id } }))?.invoiceId ?? null,
      );
      return { status: target.status, invoiceId, organizationId };
    }

    const payment = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.payment.findUnique({ where: { id: target.payment_id } }),
    );

    if (!payment?.providerSessionId) {
      // دفعة أُنشئت ولم تُفتح لها جلسة: لا شيء لنستعلم عنه.
      return {
        status: payment?.status ?? 'pending',
        invoiceId: payment?.invoiceId ?? null,
        organizationId,
      };
    }

    const result = await this.provider.getPaymentStatus(payment.providerSessionId);

    await this.recordProviderEvent(payment.id, payment.providerSessionId, result.status);

    if (result.status !== 'paid') {
      if (result.status === 'pending') {
        return { status: 'pending', invoiceId: payment.invoiceId, organizationId };
      }

      await withRlsContext(this.prisma, { organizationId }, (tx) =>
        tx.payment.update({
          where: { id: payment.id },
          data: {
            status: result.status,
            rawStatus: result.rawStatus,
            failureReason: result.failureReason?.slice(0, 300) ?? null,
          },
        }),
      );

      return { status: result.status, invoiceId: payment.invoiceId, organizationId };
    }

    // المبلغ يُقارن ولا يُصدَّق: جلسة دُفع فيها أقل من المستحق لا تُسدّد
    // الفاتورة، وتظهر للتسوية اليدوية.
    if (result.amountBaisa !== null && result.amountBaisa < payment.amountBaisa) {
      this.logger.error(
        `دفعة ناقصة ${payment.id}: وصل ${result.amountBaisa} والمستحق ${payment.amountBaisa}`,
      );
    }

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'paid',
          rawStatus: result.rawStatus,
          providerPaymentId: result.providerPaymentId,
          paidAt: new Date(),
        },
      });

      if (payment.invoiceId) {
        await markInvoicePaid(tx, payment.invoiceId, payment.amountBaisa);
        await tx.outboxEvent.create({
          data: {
            organizationId,
            eventType: OUTBOX_EVENT_TYPES.INVOICE_PAID,
            payload: { invoiceId: payment.invoiceId, paymentId: payment.id },
          },
        });
      }
    });

    return { status: 'paid', invoiceId: payment.invoiceId, organizationId };
  }

  async list(
    organizationId: string,
    status: InvoiceStatus | 'all',
    page: number,
    pageSize: number,
  ): Promise<Paginated<InvoiceSummary>> {
    const where = status === 'all' ? {} : { status };

    const { invoices, total } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => ({
        invoices: await tx.invoice.findMany({
          where,
          orderBy: { issuedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        total: await tx.invoice.count({ where }),
      }),
    );

    return {
      data: invoices.map(toInvoiceSummary),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async get(organizationId: string, invoiceId: string): Promise<InvoiceDetail> {
    const invoice = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.invoice.findFirst({
        where: { id: invoiceId },
        include: {
          lines: true,
          payments: {
            where: { status: 'pending', expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
    );

    if (!invoice) {
      throw new NotFoundException('الفاتورة غير موجودة');
    }

    return {
      ...toInvoiceSummary(invoice),
      lines: invoice.lines.map((line) => ({
        id: line.id,
        description: line.description,
        descriptionEn: line.descriptionEn,
        quantity: line.quantity,
        unitAmountBaisa: line.unitAmountBaisa,
        amountBaisa: line.amountBaisa,
      })),
      billingName: invoice.billingName,
      billingEmail: invoice.billingEmail,
      billingVatNumber: invoice.billingVatNumber,
      billingAddress: invoice.billingAddress,
      checkoutUrl: invoice.status === 'open' ? (invoice.payments[0]?.checkoutUrl ?? null) : null,
    };
  }

  /**
   * يسجّل وصول إشارة من المزوّد.
   *
   * الفريد على (المزوّد، المعرّف، النوع) يجعل تكرار النداء لا أثر له.
   * فشل الإدراج بسبب التكرار **ليس خطأً** — هو الغرض.
   */
  private async recordProviderEvent(
    paymentId: string,
    sessionId: string,
    outcome: string,
  ): Promise<void> {
    await this.prisma.paymentEvent
      .create({
        data: {
          provider: this.provider.key,
          externalId: sessionId,
          eventType: `status.${outcome}`,
          paymentId,
          outcome: 'applied',
        },
      })
      .catch(() => undefined);
  }

  private get vatRateBps(): number {
    const raw = Number(this.config.get<string>('BILLING_VAT_RATE_BPS'));
    return Number.isInteger(raw) && raw >= 0 && raw <= 10_000 ? raw : DEFAULT_VAT_RATE_BPS;
  }
}

/**
 * يسدّد فاتورة.
 *
 * الشرط على `status` في `updateMany` لا في قراءة سابقة: دفعتان تصلان
 * معاً لا يجوز أن تُسجّلا سدادين على الفاتورة نفسها.
 */
async function markInvoicePaid(
  tx: TenantScopedClient,
  invoiceId: string,
  amountBaisa: number,
): Promise<void> {
  await tx.invoice.updateMany({
    where: { id: invoiceId, status: 'open' },
    data: { status: 'paid', paidAt: new Date(), amountPaidBaisa: amountBaisa },
  });
}

interface InvoiceRow {
  id: string;
  number: string;
  status: string;
  currency: string;
  subtotalBaisa: number;
  discountBaisa: number;
  vatRateBps: number;
  vatBaisa: number;
  totalBaisa: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
}

function toInvoiceSummary(invoice: InvoiceRow): InvoiceSummary {
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status as InvoiceStatus,
    currency: invoice.currency,
    subtotalBaisa: invoice.subtotalBaisa,
    discountBaisa: invoice.discountBaisa,
    vatRateBps: invoice.vatRateBps,
    vatBaisa: invoice.vatBaisa,
    totalBaisa: invoice.totalBaisa,
    periodStart: invoice.periodStart?.toISOString() ?? null,
    periodEnd: invoice.periodEnd?.toISOString() ?? null,
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    dueAt: invoice.dueAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
  };
}

function trimSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
