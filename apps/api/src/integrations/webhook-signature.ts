import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * توقيع حمولات Webhook (§11.4).
 *
 * المشكلة التي يحلها: المستقبِل يفتح مساراً عاماً على الإنترنت لنكتب
 * إليه بيانات عملائه. بلا توقيع، **أي أحد** يعرف ذلك المسار يستطيع أن
 * يحقن في نظامه عملاء لم يوجدوا قط — وهو ليس تسريباً بل تلويثاً لقاعدة
 * بيانات يثق بها فريق مبيعات.
 *
 * الصيغة مقصودة البساطة: `HMAC-SHA256` على `<الطابع>.<الجسم>` بالسرّ
 * المشترك، ست عشرية. كل لغة تنفّذها بثلاثة أسطر، ومستقبِلٌ لا يستطيع
 * التحقق سهولةً لن يتحقق أبداً.
 *
 * والطابع الزمني داخل المُوقَّع لا بجانبه: توقيعٌ على الجسم وحده يبقى
 * صالحاً إلى الأبد، فمن التقط تسليماً قديماً أعاد إرساله متى شاء.
 */

/** طول السرّ بالبايتات قبل الترميز. 32 = 256 بت. */
const SECRET_BYTES = 32;

/** بادئة تميّز سرّ التوقيع في إعدادات العميل وفي أدوات كشف التسريب. */
const SECRET_PREFIX = 'whsec_';

export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;
}

/**
 * يبني التوقيع.
 *
 * `timestamp` بالثواني لا بالمللي: هي وحدة معظم تنفيذات التحقق عند
 * العملاء، واختلاف الوحدة يجعل كل تسليم يبدو قديماً بألف مرة.
 */
export function signWebhookPayload(
  secret: string,
  timestampSeconds: number,
  body: string,
): string {
  return createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex');
}

/**
 * يتحقق من توقيع.
 *
 * لا يُستدعى في مسار الإرسال — يعيش هنا لأنه **العقد المنشور**: هذه
 * بالضبط الدالة التي يكتبها العميل عنده، ووجودها في شيفرتنا مختبَرةً
 * يعني أن المثال في التوثيق مطابق لما نوقّع به فعلاً.
 */
export function verifyWebhookSignature(
  secret: string,
  timestampSeconds: number,
  body: string,
  signature: string,
  toleranceSeconds: number,
): boolean {
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (age > toleranceSeconds) {
    return false;
  }

  const expected = signWebhookPayload(secret, timestampSeconds, body);
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(signature, 'utf8');

  // الطول يُقارن أولاً: `timingSafeEqual` ترمي على طولين مختلفين،
  // والمقارنة الثابتة الزمن بلا هذا الفحص تصير استثناءً لا نتيجة.
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}
