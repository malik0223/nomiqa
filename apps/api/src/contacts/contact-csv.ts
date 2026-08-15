import type { ContactDetail } from '@nomiqa/contracts';

/**
 * علامة ترتيب البايتات.
 *
 * بدونها يفتح Excel على ويندوز الملف بترميز الصفحة المحلية، فتظهر كل
 * الأسماء العربية رموزاً. التصدير موجَّه لمن سيفتحه في Excel أساساً،
 * فثلاثة بايتات ثمن مقبول لملف يُقرأ بدل أن يُرمى.
 */
const BOM = '﻿';

const BASE_COLUMNS = [
  'full_name',
  'email',
  'phone',
  'organization_name',
  'job_title',
  'source',
  'follow_up_status',
  'tags',
  'card_slug',
  'message',
  'captured_at',
] as const;

type ExportContact = Pick<
  ContactDetail,
  | 'fullName'
  | 'email'
  | 'phone'
  | 'organizationName'
  | 'jobTitle'
  | 'source'
  | 'followUpStatus'
  | 'tags'
  | 'cardSlug'
  | 'message'
  | 'customFields'
  | 'capturedAt'
>;

/**
 * يبني ملف CSV من جهات الاتصال.
 *
 * دالة نقية لا تلمس قاعدة البيانات: التصدير يخرج بيانات شخصية من
 * المنصة، وأي خطأ فيه — عمود مزاح، اقتباس مكسور، صيغة تنفّذ في Excel —
 * يظهر عند المستخدم لا عندنا. لذلك يُختبر وحدةً لا عبر تكامل.
 */
export function buildContactsCsv(contacts: ExportContact[]): string {
  // أعمدة الحقول المخصصة تختلف بين بطاقة وأخرى، فنجمع اتحادها من
  // الصفوف المصدَّرة فعلاً بدل افتراض قائمة ثابتة.
  const customKeys = [
    ...new Set(contacts.flatMap((contact) => Object.keys(contact.customFields ?? {}))),
  ].sort();

  const header = [...BASE_COLUMNS, ...customKeys.map((key) => `custom_${key}`)];

  const rows = contacts.map((contact) => [
    contact.fullName,
    contact.email ?? '',
    contact.phone ?? '',
    contact.organizationName ?? '',
    contact.jobTitle ?? '',
    contact.source,
    contact.followUpStatus,
    contact.tags.map((tag) => tag.name).join(' | '),
    contact.cardSlug ?? '',
    contact.message ?? '',
    contact.capturedAt,
    ...customKeys.map((key) => contact.customFields?.[key] ?? ''),
  ]);

  // CRLF لا LF: هو ما ينص عليه RFC 4180 وما تتوقعه أدوات ويندوز.
  return BOM + [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/**
 * يهيّئ خلية واحدة.
 *
 * الاقتباس يعالج الفواصل والأسطر داخل القيمة. أما البادئة `'` أمام
 * `= + - @` فتعالج مشكلة مختلفة تماماً: Excel يعامل خلية تبدأ بها
 * **صيغةً تُنفَّذ عند الفتح**. زائر يكتب اسمه `=HYPERLINK(...)` يحوّل
 * ملف تصدير جهات الاتصال إلى هجوم على جهاز صاحب البطاقة. القيمة
 * الأصلية تبقى مقروءة، والتنفيذ وحده هو ما نمنعه.
 */
function escapeCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }

  return guarded;
}
