import type { CardLinkData } from '@nomiqa/contracts';

/**
 * يحوّل الرابط إلى href قابل للنقر.
 *
 * `tel:` و`mailto:` و`wa.me` تفتح التطبيق الأصلي على الهاتف مباشرة،
 * وهو ما يجعل البطاقة تعمل **دون تنزيل أي تطبيق** (§7.5).
 */
export function toHref(link: CardLinkData): string {
  switch (link.type) {
    case 'phone':
      return `tel:${link.value.replace(/\s/g, '')}`;

    case 'email':
      return `mailto:${link.value}`;

    case 'whatsapp': {
      // wa.me يتطلب الرقم بلا + ولا فواصل.
      const digits = link.value.replace(/[^\d]/g, '');
      return `https://wa.me/${digits}`;
    }

    case 'social':
      return normalizeUrl(link.value);

    case 'website':
    case 'booking':
    case 'custom':
    default:
      return normalizeUrl(link.value);
  }
}

/** يضيف https حين يكتب المستخدم النطاق وحده. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/** نص الزر باللغة المطلوبة مع احتياط. */
export function linkLabel(link: CardLinkData, locale: string): string {
  if (locale === 'en' && link.labelEn) return link.labelEn;
  if (link.label) return link.label;
  return defaultLabel(link, locale);
}

const DEFAULT_LABELS: Record<string, { ar: string; en: string }> = {
  phone: { ar: 'اتصال', en: 'Call' },
  email: { ar: 'بريد إلكتروني', en: 'Email' },
  whatsapp: { ar: 'واتساب', en: 'WhatsApp' },
  website: { ar: 'الموقع', en: 'Website' },
  booking: { ar: 'حجز موعد', en: 'Book a meeting' },
  social: { ar: 'تابعني', en: 'Follow' },
  custom: { ar: 'رابط', en: 'Link' },
};

function defaultLabel(link: CardLinkData, locale: string): string {
  if (link.type === 'social' && link.platform) {
    // اسم المنصة أوضح من كلمة عامة.
    return link.platform.charAt(0).toUpperCase() + link.platform.slice(1);
  }

  const entry = DEFAULT_LABELS[link.type] ?? DEFAULT_LABELS.custom!;
  return locale === 'en' ? entry.en : entry.ar;
}

/**
 * الروابط المرئية مرتبة.
 *
 * الترتيب من `position` لا من ترتيب الإدراج: المحرر يتيح إعادة
 * الترتيب، والحفظ لا يُعيد إنشاء الصفوف.
 */
export function visibleLinks(links: CardLinkData[]): CardLinkData[] {
  return links.filter((link) => link.isVisible).sort((a, b) => a.position - b.position);
}
