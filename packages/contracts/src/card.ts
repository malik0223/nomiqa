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

export interface TemplateDefinition {
  layout: 'centered' | 'start' | 'cover';
  sections: CardSection[];
  supportsCover: boolean;
  theme: CardTheme;
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
