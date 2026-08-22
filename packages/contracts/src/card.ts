/**
 * عقود البطاقة.
 *
 * تُستخدم في ثلاثة أماكن: الـAPI ينتجها، المحرر يعرضها ويعدّلها،
 * والصفحة العامة تعرضها. تعريف واحد يمنع تباعد الثلاثة.
 */

export const CARD_STATUSES = ['draft', 'published', 'unpublished'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_LINK_TYPES = [
  'phone',
  'email',
  'whatsapp',
  'website',
  'booking',
  'social',
  'custom',
] as const;
export type CardLinkType = (typeof CARD_LINK_TYPES)[number];

export const SOCIAL_PLATFORMS = [
  'linkedin',
  'x',
  'instagram',
  'facebook',
  'youtube',
  'tiktok',
  'snapchat',
  'github',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** أقسام البطاقة القابلة للترتيب والإخفاء. */
export const CARD_SECTIONS = ['identity', 'actions', 'links', 'documents'] as const;
export type CardSection = (typeof CARD_SECTIONS)[number];

export interface CardTheme {
  primaryColor?: string;
  borderRadius?: 'small' | 'medium' | 'large';
  /** فاتح أو داكن أو تابع لنظام الزائر. */
  colorScheme?: 'light' | 'dark' | 'system';
}

/**
 * المعالجة البصرية لسطح البطاقة.
 *
 * قيمة واحدة تحكم شخصية القالب كاملة (الخلفية والطبقات الزخرفية
 * وشكل الصورة وهيئة الروابط)، لأن هذه الخصائص ليست مستقلة: «زجاج»
 * بروابط «صحيفة» ليس قالباً بل خطأ. القيمة صفٌّ في قاعدة البيانات
 * ولا تضيف مكوّناً جديداً — راجع §4.4.
 */
export const CARD_SURFACES = [
  'flat',
  'aurora',
  'glass',
  'neon',
  'bento',
  'relief',
  'editorial',
  'foil',
  'spatial',
] as const;
export type CardSurface = (typeof CARD_SURFACES)[number];

export interface TemplateDefinition {
  layout: 'centered' | 'start' | 'cover';
  sections: CardSection[];
  supportsCover: boolean;
  theme: CardTheme;
  /**
   * اختياري عمداً: القوالب الثلاثة الأولى صدرت قبل وجود هذا الحقل،
   * ولقطاتها المنشورة محفوظة بلا قيمة له. الغياب يعني `flat` — أي
   * السلوك السابق حرفياً — فلا تتغيّر بطاقة منشورة بإضافة الحقل.
   */
  surface?: CardSurface;
}

export interface CardContent {
  locale: string;
  fullName: string;
  jobTitle?: string | null;
  organizationName?: string | null;
  department?: string | null;
  bio?: string | null;
  addressLine?: string | null;
}

export interface CardLinkData {
  id: string;
  type: CardLinkType;
  platform?: string | null;
  label?: string | null;
  labelEn?: string | null;
  value: string;
  position: number;
  isVisible: boolean;
  isPrimary: boolean;
}

/**
 * حقول نموذج «شارك بياناتك معي» المعروفة مسبقاً.
 *
 * الاسم ليس منها: مطلوب دائماً ولا يُعطَّل — جهة اتصال بلا اسم صف
 * لا يستطيع صاحب البطاقة التعرف عليه لاحقاً.
 */
export const CONTACT_FORM_FIELDS = [
  'email',
  'phone',
  'organizationName',
  'jobTitle',
  'message',
] as const;
export type ContactFormFieldKey = (typeof CONTACT_FORM_FIELDS)[number];

export interface ContactFormField {
  key: ContactFormFieldKey;
  required: boolean;
}

/** حقل نصي حر يعرّفه صاحب البطاقة (§8.2: حقول اختيارية قابلة للتخصيص). */
export interface ContactFormCustomField {
  /** معرّف ثابت داخل البطاقة. يُستخدم مفتاحاً في `customFields`. */
  key: string;
  label: string;
  labelEn?: string | null;
  required: boolean;
}

/**
 * إعداد نموذج التواصل.
 *
 * يدخل اللقطة المنشورة كاملاً: الصفحة العامة ترسم النموذج من اللقطة
 * وحدها، فلا يتغير شكله للزائر بينما صاحبه يعدّل مسودته.
 */
export interface CardContactForm {
  enabled: boolean;
  /** الحقول المعروفة المعروضة إضافةً إلى الاسم. */
  fields: ContactFormField[];
  customFields: ContactFormCustomField[];
}

export const DEFAULT_CONTACT_FORM: CardContactForm = {
  enabled: false,
  fields: [
    { key: 'email', required: true },
    { key: 'phone', required: false },
    { key: 'organizationName', required: false },
    { key: 'message', required: false },
  ],
  customFields: [],
};

/**
 * اللقطة المنشورة.
 *
 * كل ما تحتاجه الصفحة العامة للعرض، دون أي استعلام إضافي — وهو ما
 * يجعل تقديمها من الـCDN ممكناً.
 */
export interface CardSnapshot {
  slug: string;
  templateKey: string;
  templateVersion: number;
  defaultLocale: string;
  theme: CardTheme;
  sectionOrder: CardSection[];
  /** المحتوى مفهرساً باللغة. */
  content: Record<string, CardContent>;
  links: CardLinkData[];
  media: {
    avatarUrl?: string | null;
    coverUrl?: string | null;
    logoUrl?: string | null;
  };
  /**
   * إعداد نموذج التواصل وقت النشر.
   *
   * اختياري في النوع لا في المعنى: لقطات المرحلة 2 نُشرت قبل وجود
   * النموذج، وقراءتها يجب أن تبقى ممكنة بلا إعادة نشر.
   */
  contactForm?: CardContactForm;
}

/** ملفات الوسائط كما يعرفها المحرر: معرّفات لا روابط. */
export interface CardMediaIds {
  avatarFileId: string | null;
  coverFileId: string | null;
  logoFileId: string | null;
}

/** البطاقة كما يراها صاحبها في المحرر. */
export interface CardDetail {
  id: string;
  slug: string;
  status: CardStatus;
  templateKey: string;
  templateVersion: number;
  defaultLocale: string;
  theme: CardTheme;
  sectionOrder: CardSection[];
  revision: number;
  content: CardContent[];
  links: CardLinkData[];
  contactForm: CardContactForm;
  media: CardMediaIds;
  /**
   * روابط معاينة موقّعة قصيرة العمر للصور في المحرر.
   *
   * تختلف عن `CardSnapshot.media` عمداً: تلك روابط عامة دائمة تُقدَّم
   * للزوار، وهذه روابط خاصة تنتهي — المسودة ليست منشورة بعد.
   */
  mediaPreview: {
    avatarUrl?: string | null;
    coverUrl?: string | null;
    logoUrl?: string | null;
  };
  publishedAt: string | null;
  updatedAt: string;
  /** يعكس آخر نشر: هل المسودة الحالية تختلف عمّا يراه الزوار؟ */
  hasUnpublishedChanges: boolean;
}

export interface CardSummary {
  id: string;
  slug: string;
  status: CardStatus;
  fullName: string;
  templateKey: string;
  publishedAt: string | null;
  updatedAt: string;
  hasUnpublishedChanges: boolean;
}

/** قالب متاح للاختيار في المحرر. */
export interface TemplateSummary {
  key: string;
  name: string;
  nameEn: string | null;
  latestVersion: number;
  definition: TemplateDefinition;
}

/**
 * ما تحتاجه الصفحة العامة.
 *
 * مصدرها اللقطة المنشورة وحدها — لا استعلام على جداول المؤسسة، ولا
 * سياق مصادقة، فتُقدَّم من الـCDN لزائر مجهول (§7.5).
 */
export interface PublicCardPage {
  cardId: string;
  slug: string;
  snapshot: CardSnapshot;
  template: TemplateDefinition;
  publishedAt: string;
}

/** حصة الباقة. تُقرأ من الـAPI فلا يكرر المحرر أرقام الحدود. */
export interface CardEntitlements {
  maxCards: number;
  usedCards: number;
  canCreate: boolean;
}
