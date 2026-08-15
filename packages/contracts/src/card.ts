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
  publishedAt: string | null;
  updatedAt: string;
}

export interface CardSummary {
  id: string;
  slug: string;
  status: CardStatus;
  fullName: string;
  publishedAt: string | null;
  updatedAt: string;
}
