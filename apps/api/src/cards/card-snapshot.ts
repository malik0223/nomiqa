import type {
  CardContactForm,
  CardContent,
  CardLinkData,
  CardSection,
  CardSnapshot,
  CardTheme,
  ContactFormFieldKey,
} from '@nomiqa/contracts';
import { CARD_SECTIONS, CONTACT_FORM_FIELDS, DEFAULT_CONTACT_FORM } from '@nomiqa/contracts';

/**
 * صفوف البطاقة كما تخرج من قاعدة البيانات، بلا أنواع Prisma.
 *
 * الفصل مقصود: بناء اللقطة منطق نقي قابل للاختبار بلا قاعدة بيانات،
 * وهو أهم من أن يُختبر عبر تكامل بطيء — اللقطة الخاطئة تعني بطاقة
 * منشورة خاطئة لا يكتشفها أحد حتى يشتكي زائر.
 */
export interface SnapshotSource {
  slug: string;
  templateKey: string;
  templateVersion: number;
  defaultLocale: string;
  theme: unknown;
  sectionOrder: unknown;
  localizations: Array<{
    locale: string;
    fullName: string;
    jobTitle: string | null;
    organizationName: string | null;
    department: string | null;
    bio: string | null;
    addressLine: string | null;
  }>;
  links: Array<{
    id: string;
    type: string;
    platform: string | null;
    label: string | null;
    labelEn: string | null;
    value: string;
    position: number;
    isVisible: boolean;
    isPrimary: boolean;
  }>;
  media: {
    avatarUrl?: string | null;
    coverUrl?: string | null;
    logoUrl?: string | null;
  };
  contactForm: unknown;
}

/**
 * يبني اللقطة المنشورة.
 *
 * **الروابط المخفية لا تدخل اللقطة إطلاقاً.** إخفاء الرابط في المحرر
 * قرار خصوصية لا قرار عرض: لو دخل الرقم المخفي اللقطة لظهر في مصدر
 * الصفحة العامة لكل من يفتح «عرض المصدر» — وهو تسريب صامت أسوأ من
 * إظهاره عمداً.
 */
export function buildSnapshot(source: SnapshotSource): CardSnapshot {
  const content: Record<string, CardContent> = {};

  for (const localization of source.localizations) {
    content[localization.locale] = {
      locale: localization.locale,
      fullName: localization.fullName,
      jobTitle: localization.jobTitle,
      organizationName: localization.organizationName,
      department: localization.department,
      bio: localization.bio,
      addressLine: localization.addressLine,
    };
  }

  const links: CardLinkData[] = source.links
    .filter((link) => link.isVisible)
    .sort((first, second) => first.position - second.position)
    .map((link) => ({
      id: link.id,
      type: link.type as CardLinkData['type'],
      platform: link.platform,
      label: link.label,
      labelEn: link.labelEn,
      value: link.value,
      position: link.position,
      isVisible: true,
      isPrimary: link.isPrimary,
    }));

  return {
    slug: source.slug,
    templateKey: source.templateKey,
    templateVersion: source.templateVersion,
    defaultLocale: source.defaultLocale,
    theme: parseTheme(source.theme),
    sectionOrder: parseSectionOrder(source.sectionOrder),
    content,
    links,
    media: {
      avatarUrl: source.media.avatarUrl ?? null,
      coverUrl: source.media.coverUrl ?? null,
      logoUrl: source.media.logoUrl ?? null,
    },
    contactForm: parseContactForm(source.contactForm),
  };
}

/**
 * شروط النشر.
 *
 * تُرجع قائمة الأسباب بدل رمي أول خطأ: المستخدم يريد أن يعرف كل ما
 * ينقصه دفعة واحدة، لا أن يصلح واحداً ليكتشف الثاني.
 */
export function publishBlockers(snapshot: CardSnapshot): string[] {
  const blockers: string[] = [];

  const primary = snapshot.content[snapshot.defaultLocale];
  if (!primary || primary.fullName.trim().length < 2) {
    blockers.push('أضف الاسم الكامل بلغة البطاقة الافتراضية');
  }

  if (snapshot.links.length === 0) {
    // بطاقة بلا وسيلة تواصل واحدة ليست بطاقة تعريف — هي صورة اسم.
    blockers.push('أضف وسيلة تواصل واحدة على الأقل');
  }

  return blockers;
}

/** الثيم المخزَّن JSON حر؛ نقبل الحقول المعروفة فقط. */
export function parseTheme(value: unknown): CardTheme {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const raw = value as Record<string, unknown>;
  const theme: CardTheme = {};

  if (typeof raw.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.primaryColor)) {
    theme.primaryColor = raw.primaryColor;
  }
  if (
    raw.borderRadius === 'small' ||
    raw.borderRadius === 'medium' ||
    raw.borderRadius === 'large'
  ) {
    theme.borderRadius = raw.borderRadius;
  }
  if (raw.colorScheme === 'light' || raw.colorScheme === 'dark' || raw.colorScheme === 'system') {
    theme.colorScheme = raw.colorScheme;
  }

  return theme;
}

/**
 * إعداد نموذج التواصل المخزَّن.
 *
 * يُقرأ بتساهل ويُكتب بتشدد: العمود قد يحمل `null` لبطاقة أُنشئت قبل
 * وجود الميزة، أو إعداداً كتبه إصدار أقدم من التطبيق. القيمة الافتراضية
 * هي نموذج **معطَّل** — الميزة تُفعَّل بقرار صاحب البطاقة لا بالغياب.
 */
export function parseContactForm(value: unknown): CardContactForm {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_CONTACT_FORM };
  }

  const raw = value as Record<string, unknown>;
  const known = new Set<string>(CONTACT_FORM_FIELDS);
  const seenFields = new Set<string>();
  const seenCustom = new Set<string>();

  const fields = Array.isArray(raw.fields)
    ? raw.fields.flatMap((entry): CardContactForm['fields'] => {
        if (typeof entry !== 'object' || entry === null) return [];
        const field = entry as Record<string, unknown>;
        if (typeof field.key !== 'string' || !known.has(field.key) || seenFields.has(field.key)) {
          return [];
        }
        seenFields.add(field.key);
        return [{ key: field.key as ContactFormFieldKey, required: field.required === true }];
      })
    : [];

  const customFields = Array.isArray(raw.customFields)
    ? raw.customFields.flatMap((entry): CardContactForm['customFields'] => {
        if (typeof entry !== 'object' || entry === null) return [];
        const field = entry as Record<string, unknown>;
        if (typeof field.key !== 'string' || typeof field.label !== 'string') return [];
        if (seenCustom.has(field.key)) return [];
        seenCustom.add(field.key);
        return [
          {
            key: field.key,
            label: field.label,
            labelEn: typeof field.labelEn === 'string' ? field.labelEn : null,
            required: field.required === true,
          },
        ];
      })
    : [];

  return { enabled: raw.enabled === true, fields, customFields };
}

/** ترتيب الأقسام المخزَّن. القيم غير المعروفة تُسقط لا تُمرَّر للعرض. */
export function parseSectionOrder(value: unknown): CardSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const known = new Set<string>(CARD_SECTIONS);
  const seen = new Set<string>();

  return value.filter((entry): entry is CardSection => {
    if (typeof entry !== 'string' || !known.has(entry) || seen.has(entry)) {
      return false;
    }
    seen.add(entry);
    return true;
  });
}
