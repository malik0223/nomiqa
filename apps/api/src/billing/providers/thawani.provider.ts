import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentProvider,
  PaymentProviderError,
  type CheckoutSession,
  type CreateCheckoutInput,
  type PaymentStatusResult,
  type ProviderPaymentStatus,
} from './payment-provider.js';

/**
 * مُحوّل بوابة ثواني (ADR-014).
 *
 * ثواني عُمانية وتعمل بالريال العُماني، والمبالغ عندها **بالبيسة**
 * أعداداً صحيحة — نفس وحدتنا، فلا تحويل ولا تقريب على الحدود.
 *
 * عناوين الخدمة في متغيرات بيئة لا ثوابت: ثواني تفصل بيئة الاختبار
 * (UAT) عن الإنتاج بمضيفين مختلفين، وقد راجعت أكثر من صيغة معلنة
 * للمسار الأساسي. جعلها إعداداً يجعل تصحيح عنوان خاطئ تغييراً في
 * ملف بيئة لا إصداراً جديداً.
 *
 * **لا تحقق من توقيع النداء الراجع.** لا لأنه غير مهم بل لأننا لا
 * نعتمد عليه أصلاً: استلام النداء يستدعي `getPaymentStatus`، وهي
 * تستعلم ثواني بمفاتيحنا. توقيع مزوَّر لا ينفع صاحبه شيئاً حين تكون
 * الحقيقة مقروءة من المصدر في كل مرة.
 */

const DEFAULT_UAT_BASE_URL = 'https://uatcheckout.thawani.om/api/v1';
const DEFAULT_UAT_CHECKOUT_URL = 'https://uatcheckout.thawani.om/pay';
const REQUEST_TIMEOUT_MS = 15_000;

/** جلسة ثواني تنتهي بعد يوم افتراضياً. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface ThawaniEnvelope<T> {
  success: boolean;
  code: number;
  description?: string;
  data?: T;
}

interface ThawaniSession {
  session_id: string;
  payment_status?: string;
  total_amount?: number;
  invoice?: string;
  /** معرّف الدفعة بعد نجاحها، إن أعادها المزوّد. */
  payment_id?: string;
}

@Injectable()
export class ThawaniProvider extends PaymentProvider {
  readonly key = 'thawani';

  private readonly logger = new Logger(ThawaniProvider.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  /**
   * هل الإعداد مكتمل؟
   *
   * تُفحص عند الإقلاع لا عند أول عملية دفع: مفتاح ناقص يجب أن يظهر في
   * سجل بدء التشغيل، لا في وجه أول عميل يحاول الشراء.
   */
  isConfigured(): boolean {
    return Boolean(this.secretKey && this.publishableKey);
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const body: Record<string, unknown> = {
      client_reference_id: input.clientReferenceId,
      mode: 'payment',
      products: input.items.map((item) => ({
        name: item.name.slice(0, 40),
        unit_amount: item.unitAmountBaisa,
        quantity: item.quantity,
      })),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: input.metadata ?? {},
    };

    if (input.providerCustomerId) {
      body.customer_id = input.providerCustomerId;
    }

    const session = await this.request<ThawaniSession>('POST', '/checkout/session', body);

    if (!session.session_id) {
      throw new PaymentProviderError('لم تُرجع البوابة معرّف جلسة', false);
    }

    return {
      providerSessionId: session.session_id,
      checkoutUrl: `${this.checkoutBaseUrl}/${session.session_id}?key=${this.publishableKey}`,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    };
  }

  async getPaymentStatus(providerSessionId: string): Promise<PaymentStatusResult> {
    const session = await this.request<ThawaniSession>(
      'GET',
      `/checkout/session/${encodeURIComponent(providerSessionId)}`,
    );

    const raw = session.payment_status ?? 'unknown';

    return {
      status: mapStatus(raw),
      rawStatus: raw,
      providerPaymentId: session.payment_id ?? null,
      amountBaisa: typeof session.total_amount === 'number' ? session.total_amount : null,
      failureReason: mapStatus(raw) === 'failed' ? raw : null,
    };
  }

  /**
   * نداء واحد إلى ثواني.
   *
   * مهلة صريحة: بوابة بطيئة لا يجوز أن تُبقي طلب مستخدم معلّقاً حتى
   * مهلة الخادم. أخطاء الشبكة والمهلة وخمسمئة تُوسَم `retryable` فيعيد
   * الـWorker المحاولة، وأخطاء الطلب (‏4xx) لا تُعاد — إعادة إرسال
   * حمولة مرفوضة تُنتج الرفض نفسه.
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new PaymentProviderError('بوابة الدفع غير مُعدّة — راجع متغيرات THAWANI_*', false);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'thawani-api-key': this.secretKey,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطأ شبكة';
      throw new PaymentProviderError(`تعذّر الاتصال ببوابة الدفع: ${message}`, true);
    } finally {
      clearTimeout(timeout);
    }

    const payload = (await response.json().catch(() => null)) as ThawaniEnvelope<T> | null;

    if (!response.ok || !payload?.success) {
      // لا نسجّل جسم الاستجابة: قد يحمل بيانات دفع.
      const description = payload?.description ?? `HTTP ${response.status}`;
      this.logger.error(`فشل نداء ثواني ${method} ${path}: ${description}`);
      throw new PaymentProviderError(
        `فشل نداء بوابة الدفع: ${description}`,
        response.status >= 500 || response.status === 429,
      );
    }

    if (payload.data === undefined) {
      throw new PaymentProviderError('استجابة بوابة الدفع بلا بيانات', false);
    }

    return payload.data;
  }

  private get baseUrl(): string {
    return trimSlash(this.config.get<string>('THAWANI_BASE_URL') ?? DEFAULT_UAT_BASE_URL);
  }

  private get checkoutBaseUrl(): string {
    return trimSlash(
      this.config.get<string>('THAWANI_CHECKOUT_URL') ?? DEFAULT_UAT_CHECKOUT_URL,
    );
  }

  private get secretKey(): string {
    return this.config.get<string>('THAWANI_SECRET_KEY') ?? '';
  }

  private get publishableKey(): string {
    return this.config.get<string>('THAWANI_PUBLISHABLE_KEY') ?? '';
  }
}

/**
 * يترجم حالة ثواني إلى حالاتنا الأربع.
 *
 * كل ما لا نعرفه = `pending` لا `failed`: وسم دفعة ناجحة بحالة غير
 * معروفة بأنها فاشلة يُلغي اشتراكاً مدفوعاً، بينما إبقاؤها معلّقة
 * يجعل الاستعلام التالي يصحّحها.
 */
export function mapStatus(raw: string): ProviderPaymentStatus {
  switch (raw.toLowerCase()) {
    case 'paid':
    case 'success':
    case 'succeeded':
      return 'paid';
    case 'cancelled':
    case 'canceled':
      return 'canceled';
    case 'failed':
    case 'declined':
    case 'expired':
      return 'failed';
    default:
      return 'pending';
  }
}

function trimSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
