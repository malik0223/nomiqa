/**
 * واجهة مزوّد الدفع.
 *
 * الطبقة الوحيدة التي تعرف بوابة الدفع. كل ما فوقها — الاشتراكات
 * والفواتير والحصص — يتعامل بمفاهيمنا: مرجع دفعة، مبلغ بالبيسة، وحالة
 * من ثلاث. تبديل البوابة (ADR-014) يجب أن يكون ملف مُحوّل واحداً.
 *
 * قاعدة حاكمة: **الحالة لا تُصدَّق من النداء الراجع**. `getPaymentStatus`
 * تستعلم المزوّد مباشرةً؛ ما يصل في جسم الطلب إشارةٌ بأن شيئاً حدث،
 * لا إثبات بأنه دفع.
 */

export type ProviderPaymentStatus = 'pending' | 'paid' | 'failed' | 'canceled';

export interface CheckoutLineItem {
  /** اسم يظهر على صفحة الدفع — يقرؤه العميل قبل أن يدفع. */
  name: string;
  unitAmountBaisa: number;
  quantity: number;
}

export interface CreateCheckoutInput {
  /** مرجعنا الفريد. هو ما يربط الجلسة بفاتورتنا عند العودة. */
  clientReferenceId: string;
  items: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  /** بريد العميل — يُملأ مسبقاً على صفحة الدفع إن دعمه المزوّد. */
  customerEmail?: string;
  /** رمز العميل المحفوظ لدى المزوّد، للتحصيل المتكرر لاحقاً. */
  providerCustomerId?: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  providerSessionId: string;
  checkoutUrl: string;
  expiresAt: Date | null;
}

export interface PaymentStatusResult {
  status: ProviderPaymentStatus;
  /** الحالة كما وردت نصاً — تُحفظ للتشخيص دون تفسير. */
  rawStatus: string;
  providerPaymentId: string | null;
  amountBaisa: number | null;
  failureReason: string | null;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export abstract class PaymentProvider {
  abstract readonly key: string;

  abstract createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;

  /**
   * يستعلم حالة الدفع من المزوّد.
   *
   * المصدر الوحيد للحقيقة عن أن مبلغاً وصل.
   */
  abstract getPaymentStatus(providerSessionId: string): Promise<PaymentStatusResult>;
}
