import type { CardSnapshot } from '@nomiqa/contracts';
import { toHref } from './link-utils';

export interface VCardOptions {
  /** لغة المحتوى المستخدمة في الحقول النصية. */
  locale: string;
  /** الرابط العام الثابت للبطاقة — يُدرج كـURL في جهة الاتصال. */
  publicUrl: string;
}

/**
 * يولّد vCard 3.0.
 *
 * لماذا 3.0 لا 4.0: النسخة 3.0 هي ما تستورده تطبيقات جهات الاتصال في
 * iOS وAndroid بلا مفاجآت. النسخة 4.0 أحدث ومدعومة جزئياً، والفارق
 * لا يخدم المستخدم بشيء — والهدف هنا أن يُحفظ الاسم من أول محاولة.
 *
 * القاعدة الحاكمة: **لا تدخل vCard إلا الحقول المرئية**. الرابط الذي
 * أخفاه صاحب البطاقة ليس حقلاً مؤجلاً، بل قرار بعدم مشاركته.
 */
export function buildVCard(snapshot: CardSnapshot, options: VCardOptions): string {
  const content =
    snapshot.content[options.locale] ??
    snapshot.content[snapshot.defaultLocale] ??
    Object.values(snapshot.content)[0];

  if (!content) {
    throw new Error('لا يوجد محتوى لبناء vCard');
  }

  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];

  // N يتوقع خمسة أجزاء: العائلة;الاسم;الأوسط;اللقب;اللاحقة.
  // نضع الاسم الكامل في الجزء الأول: التقسيم التلقائي للأسماء العربية
  // يخطئ أكثر مما يصيب (اسم مركّب، «بن»، ألقاب)، والنتيجة الخاطئة
  // تظهر في هاتف الطرف الآخر إلى الأبد.
  lines.push(`N:${escapeValue(content.fullName)};;;;`);
  lines.push(`FN:${escapeValue(content.fullName)}`);

  if (content.jobTitle) {
    lines.push(`TITLE:${escapeValue(content.jobTitle)}`);
  }

  if (content.organizationName) {
    const org = content.department
      ? `${escapeValue(content.organizationName)};${escapeValue(content.department)}`
      : escapeValue(content.organizationName);
    lines.push(`ORG:${org}`);
  }

  for (const link of snapshot.links) {
    switch (link.type) {
      case 'phone':
        lines.push(`TEL;TYPE=CELL,VOICE:${escapeValue(link.value)}`);
        break;

      case 'whatsapp':
        // واتساب رقم هاتف لا رابط: حفظه كـURL يجعله سطراً لا يُتصل به.
        lines.push(`TEL;TYPE=CELL:${escapeValue(link.value)}`);
        break;

      case 'email':
        lines.push(`EMAIL;TYPE=INTERNET,WORK:${escapeValue(link.value)}`);
        break;

      case 'website':
      case 'booking':
      case 'social':
      case 'custom':
        lines.push(`URL:${escapeValue(toHref(link))}`);
        break;

      default:
        break;
    }
  }

  if (content.addressLine) {
    // ADR يتوقع سبعة أجزاء؛ نملأ «الشارع» ونترك الباقي فارغاً بدل
    // تقسيم عنوان حر بتخمين.
    lines.push(`ADR;TYPE=WORK:;;${escapeValue(content.addressLine)};;;;`);
  }

  if (content.bio) {
    lines.push(`NOTE:${escapeValue(content.bio)}`);
  }

  if (snapshot.media.avatarUrl) {
    lines.push(`PHOTO;VALUE=URI:${escapeValue(snapshot.media.avatarUrl)}`);
  }

  // الرابط العام آخراً وبوسم واضح: من يحفظ البطاقة يجب أن يجد طريق
  // العودة إلى نسختها المحدَّثة، لا نسخة مجمّدة وقت الحفظ.
  lines.push(`URL;TYPE=PROFILE:${escapeValue(options.publicUrl)}`);
  lines.push('END:VCARD');

  // CRLF إلزامي في RFC 6350؛ بعض المستوردات ترفض السطور بـLF وحده.
  return `${lines.join('\r\n')}\r\n`;
}

/** اسم ملف آمن. لا نستخدم اسم صاحب البطاقة: قد يكون عربياً أو يحمل محارف مسار. */
export function vCardFileName(slug: string): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, '') || 'contact';
  return `${safe}.vcf`;
}

/**
 * يهرّب القيمة وفق RFC 6350 §3.4.
 * الفاصلة والفاصلة المنقوطة والشرطة المائلة محارف بنيوية في vCard،
 * وتركها خاماً يقسم الحقل إلى حقول وهمية عند الاستيراد.
 */
function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}
