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
