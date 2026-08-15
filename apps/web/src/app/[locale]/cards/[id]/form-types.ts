import type {
  CardDetail,
  CardLinkType,
  CardSection,
  CardSnapshot,
  TemplateSummary,
} from '@nomiqa/contracts';
import type { CardUpdateFieldsInput } from '@nomiqa/validation';

/**
 * قيم النموذج في المحرر.
 *
 * كلها نصوص لا `null`: حقل إدخال في React لا يقبل `null` دون أن يصبح
 * غير مُتحكَّم به، والتحويل إلى `null` يتم عند الإرسال في مكان واحد
 * (`toPayload`) لا في كل حقل.
 */
export interface CardFormValues {
  slug: string;
  templateKey: string;
  defaultLocale: 'ar' | 'en';
  theme: {
    primaryColor: string;
    borderRadius: 'small' | 'medium' | 'large';
    colorScheme: 'light' | 'dark' | 'system';
  };
  sectionOrder: CardSection[];
  content: CardContentValues[];
  links: CardLinkValues[];
  avatarFileId: string | null;
  coverFileId: string | null;
  logoFileId: string | null;
}

export interface CardContentValues {
  locale: 'ar' | 'en';
  fullName: string;
  jobTitle: string;
  organizationName: string;
  department: string;
  bio: string;
  addressLine: string;
}

export interface CardLinkValues {
  /** غائب للرابط الجديد؛ الـAPI يولّده ويعيده في الحفظ التالي. */
  id?: string;
  type: CardLinkType;
  platform: string;
  label: string;
  labelEn: string;
  value: string;
  isVisible: boolean;
  isPrimary: boolean;
}

export const EDITOR_LOCALES: Array<'ar' | 'en'> = ['ar', 'en'];

export function toFormValues(card: CardDetail): CardFormValues {
  const content = EDITOR_LOCALES.map((locale) => {
    const existing = card.content.find((entry) => entry.locale === locale);
    return {
      locale,
      fullName: existing?.fullName ?? '',
      jobTitle: existing?.jobTitle ?? '',
      organizationName: existing?.organizationName ?? '',
      department: existing?.department ?? '',
      bio: existing?.bio ?? '',
      addressLine: existing?.addressLine ?? '',
    };
  });

  return {
    slug: card.slug,
    templateKey: card.templateKey,
    defaultLocale: (card.defaultLocale === 'en' ? 'en' : 'ar') as 'ar' | 'en',
    theme: {
      primaryColor: card.theme.primaryColor ?? '',
      borderRadius: card.theme.borderRadius ?? 'medium',
      colorScheme: card.theme.colorScheme ?? 'system',
    },
    sectionOrder: card.sectionOrder,
    content,
    links: card.links
      .slice()
      .sort((first, second) => first.position - second.position)
      .map((link) => ({
        id: link.id,
        type: link.type,
        platform: link.platform ?? '',
        label: link.label ?? '',
        labelEn: link.labelEn ?? '',
        value: link.value,
        isVisible: link.isVisible,
        isPrimary: link.isPrimary,
      })),
    avatarFileId: card.media.avatarFileId,
    coverFileId: card.media.coverFileId,
    logoFileId: card.media.logoFileId,
  };
}

/**
 * يحوّل قيم النموذج إلى حمولة الـAPI.
 *
 * **اللغة الفارغة تُحذف**: بطاقة بلا اسم إنجليزي ليست بطاقة باسم
 * إنجليزي فارغ — الفرق يظهر عند العرض، حيث تسقط اللغة الناقصة إلى
 * اللغة الافتراضية بدل عرض عنوان فارغ.
 */
export function toPayload(values: CardFormValues): CardUpdateFieldsInput {
  const content = values.content
    .filter((entry) => entry.fullName.trim().length > 0)
    .map((entry) => ({
      locale: entry.locale,
      fullName: entry.fullName.trim(),
      jobTitle: entry.jobTitle,
      organizationName: entry.organizationName,
      department: entry.department,
      bio: entry.bio,
      addressLine: entry.addressLine,
    }));

  return {
    slug: values.slug,
    templateKey: values.templateKey,
    defaultLocale: values.defaultLocale,
    theme: {
      ...(values.theme.primaryColor ? { primaryColor: values.theme.primaryColor } : {}),
      borderRadius: values.theme.borderRadius,
      colorScheme: values.theme.colorScheme,
    },
    sectionOrder: values.sectionOrder,
    content,
    links: values.links
      .filter((link) => link.value.trim().length > 0)
      .map((link, index) => ({
        ...(link.id ? { id: link.id } : {}),
        type: link.type,
        platform: link.type === 'social' && link.platform ? (link.platform as never) : null,
        label: link.label,
        labelEn: link.labelEn,
        value: link.value.trim(),
        // الترتيب من موضع العنصر في القائمة لا من حقل يملأه المستخدم.
        position: index,
        isVisible: link.isVisible,
        isPrimary: link.isPrimary,
      })),
    avatarFileId: values.avatarFileId,
    coverFileId: values.coverFileId,
    logoFileId: values.logoFileId,
  };
}

/**
 * يبني لقطة معاينة من قيم النموذج.
 *
 * نفس بنية اللقطة المنشورة، فالمعاينة تمر بمحرك العرض نفسه ولا يوجد
 * «مسار معاينة» ثانٍ يتباعد عن المسار الحقيقي بمرور الوقت.
 */
export function toPreviewSnapshot(
  values: CardFormValues,
  template: TemplateSummary | undefined,
  mediaPreview: { avatarUrl?: string | null; coverUrl?: string | null; logoUrl?: string | null },
): CardSnapshot {
  const content: CardSnapshot['content'] = {};

  for (const entry of values.content) {
    if (entry.fullName.trim().length === 0) continue;
    content[entry.locale] = {
      locale: entry.locale,
      fullName: entry.fullName,
      jobTitle: entry.jobTitle || null,
      organizationName: entry.organizationName || null,
      department: entry.department || null,
      bio: entry.bio || null,
      addressLine: entry.addressLine || null,
    };
  }

  return {
    slug: values.slug,
    templateKey: values.templateKey,
    templateVersion: template?.latestVersion ?? 1,
    defaultLocale: values.defaultLocale,
    theme: {
      ...(values.theme.primaryColor ? { primaryColor: values.theme.primaryColor } : {}),
      borderRadius: values.theme.borderRadius,
      colorScheme: values.theme.colorScheme,
    },
    sectionOrder: values.sectionOrder,
    content,
    links: values.links
      .filter((link) => link.value.trim().length > 0)
      .map((link, index) => ({
        id: link.id ?? `preview-${index}`,
        type: link.type,
        platform: link.platform || null,
        label: link.label || null,
        labelEn: link.labelEn || null,
        value: link.value,
        position: index,
        isVisible: link.isVisible,
        isPrimary: link.isPrimary,
      })),
    media: {
      avatarUrl: mediaPreview.avatarUrl ?? null,
      coverUrl: mediaPreview.coverUrl ?? null,
      logoUrl: mediaPreview.logoUrl ?? null,
    },
  };
}
