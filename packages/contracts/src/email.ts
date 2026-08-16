/**
 * عقد رسائل البريد بين الـAPI (المنتِج) والـWorker (المستهلك).
 *
 * المبدأ: الـAPI يرسل **مفتاح قالب وبيانات**، لا نصاً جاهزاً.
 * فالقوالب تعيش في مكان واحد، وتغييرها لا يتطلب تعديل من يستدعيها،
 * وتبقى الترجمة العربية والإنجليزية مصدراً واحداً.
 */

export const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  ORGANIZATION_INVITE: 'organization_invite',
  /** إشعار صاحب البطاقة بوصول جهة اتصال جديدة. */
  CONTACT_CAPTURED: 'contact_captured',
  /** رسالة الشكر الآلية للزائر الذي شارك بياناته. */
  CONTACT_THANK_YOU: 'contact_thank_you',

  // ---------- المرحلة 4 ----------
  /** طلب تعديل بطاقة ينتظر مراجعة مسؤول (§9.3). */
  CHANGE_REQUEST_SUBMITTED: 'change_request_submitted',
  /** نتيجة مراجعة طلب التعديل — تصل إلى مقدّمه. */
  CHANGE_REQUEST_REVIEWED: 'change_request_reviewed',
  /** فاتورة صدرت وتنتظر السداد (§9.4). */
  INVOICE_ISSUED: 'invoice_issued',
  /** إيصال سداد. */
  INVOICE_PAID: 'invoice_paid',
  /** فشل تحصيل — تبدأ مهلة السماح. */
  PAYMENT_FAILED: 'payment_failed',
  /** تعليق حساب المؤسسة (§9.5). */
  ORGANIZATION_SUSPENDED: 'organization_suspended',

  // ---------- المرحلة 6 ----------
  /** تقرير ما بعد الفعالية (§11.3) — يصل بعد انتهائها بساعات. */
  EVENT_REPORT: 'event_report',
} as const;

export type EmailTemplate = (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];

export interface EmailJobData {
  /** معرّف فريد للمهمة يمنع الإرسال المزدوج عند إعادة المحاولة. */
  idempotencyKey: string;
  organizationId?: string;
  to: string;
  template: EmailTemplate;
  locale: 'ar' | 'en';
  /** متغيرات القالب. لا تضع فيها أسراراً — تُخزَّن في Redis. */
  variables: Record<string, string>;
}
