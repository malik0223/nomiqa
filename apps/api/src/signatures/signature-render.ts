import type { SignatureTemplateKey } from '@nomiqa/contracts';

/**
 * توليد توقيع البريد (خارطة الطريق §10.3).
 *
 * الناتج HTML **يُلصق في محرر بريد**، لا صفحة تُفتح في متصفح. الفرق
 * يحكم كل سطر هنا:
 *
 *  1. **جداول لا Flexbox**: Outlook على ويندوز يعرض عبر محرك Word،
 *     ولا يعرف `display:flex` ولا `grid` ولا `max-width`.
 *  2. **أنماط سطرية لا أصناف**: Gmail يحذف `<style>` كاملاً.
 *  3. **روابط مطلقة للصور**: لا رابط نسبي ولا `data:` — الأول بلا معنى
 *     خارج موقعنا، والثاني يحجبه Gmail.
 *  4. **لا JavaScript ولا وسوم خارجية**: تُجرَّد كلها عند الإرسال، ووجودها
 *     يرفع احتمال تصنيف الرسالة بريداً مزعجاً.
 *
 * ولذلك هذا الملف منطق نقي بلا Nest ولا قاعدة بيانات: التوقيع الخاطئ
 * يُرسل آلاف المرات قبل أن يلاحظه أحد، فيستحق اختباراً مباشراً.
 */

export interface SignatureLink {
  label: string;
  /** رابط مطلق أو mailto:/tel: — يُنقّى قبل الإدراج. */
  url: string;
}

export interface SignatureSource {
  fullName: string;
  jobTitle: string | null;
  organizationName: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  socialLinks: SignatureLink[];
  avatarUrl: string | null;
  logoUrl: string | null;
  /** رابط البطاقة العامة بمصدر `signature`. */
  cardUrl: string;
  qrUrl: string | null;
  accentColor: string;
  direction: 'rtl' | 'ltr';
  disclaimer: string | null;
  labels: SignatureLabels;
}

export interface SignatureLabels {
  viewCard: string;
  phone: string;
  email: string;
  website: string;
}

/** اللون الافتراضي حين لا تحدد المؤسسة لوناً. */
export const DEFAULT_ACCENT_COLOR = '#0f766e';

/** خط النص. مكدّس بلا خطوط مستضافة: عملاء البريد لا يحمّلون خطوطاً. */
const FONT_STACK =
  "-apple-system, 'Segoe UI', Tahoma, 'Helvetica Neue', Arial, 'Noto Sans Arabic', sans-serif";

const MUTED = '#6b7280';
const TEXT = '#111827';

/**
 * يبني التوقيع بصيغتيه.
 *
 * الصيغتان معاً دائماً: عميل البريد يختار بينهما بحسب وضع التحرير،
 * وتوقيع بلا نسخة نصية يظهر فارغاً في رسائل النص الصِّرف — وهي الوضع
 * الافتراضي في كثير من عملاء الأعمال.
 */
export function renderSignature(
  template: SignatureTemplateKey,
  source: SignatureSource,
): { html: string; text: string } {
  return { html: renderHtml(template, source), text: renderText(source) };
}

function renderHtml(template: SignatureTemplateKey, source: SignatureSource): string {
  const body =
    template === 'compact'
      ? compactLayout(source)
      : template === 'stacked'
        ? stackedLayout(source)
        : template === 'banner'
          ? bannerLayout(source)
          : classicLayout(source);

  // جدول خارجي واحد يحمل الاتجاه والخط: الوراثة من محرر البريد غير
  // مضمونة، وتوقيع عربي يظهر بمحاذاة يسار في Outlook خللٌ يراه المتلقي
  // لا المرسل.
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="${source.direction}"`,
    ` style="border-collapse:collapse;font-family:${FONT_STACK};font-size:14px;line-height:1.5;color:${TEXT}">`,
    '<tr><td style="padding:0">',
    body,
    disclaimerBlock(source),
    '</td></tr></table>',
  ].join('');
}

// ---------------------------------------------------------------
// التخطيطات
// ---------------------------------------------------------------

/** الصورة يميناً/يساراً، التفاصيل بجانبها، ورمز QR في الطرف. */
function classicLayout(source: SignatureSource): string {
  const cells: string[] = [];

  if (source.avatarUrl) {
    cells.push(
      cell(image(source.avatarUrl, 64, source.fullName, '50%'), 'padding:0 0 0 14px;width:64px'),
    );
  }

  cells.push(cell([identityBlock(source), contactBlock(source)].join(''), 'padding:0'));

  if (source.qrUrl) {
    cells.push(cell(qrBlock(source), 'padding:0 14px 0 0;width:76px;text-align:center'));
  }

  return row(cells, source);
}

/** سطران فقط. للتوقيعات التي تُلحق بكل رسالة في محادثة طويلة. */
function compactLayout(source: SignatureSource): string {
  const heading = [
    strong(source.fullName, source.accentColor),
    source.jobTitle ? muted(` — ${escapeHtml(source.jobTitle)}`) : '',
    source.organizationName ? muted(` · ${escapeHtml(source.organizationName)}`) : '',
  ].join('');

  return [
    `<div style="margin:0 0 4px">${heading}</div>`,
    `<div style="margin:0">${inlineContacts(source)}</div>`,
  ].join('');
}

/** الصورة فوق التفاصيل. الأنسب للعرض على الهاتف. */
function stackedLayout(source: SignatureSource): string {
  return [
    source.avatarUrl
      ? `<div style="margin:0 0 8px">${image(source.avatarUrl, 56, source.fullName, '50%')}</div>`
      : '',
    identityBlock(source),
    contactBlock(source),
    source.qrUrl ? `<div style="margin:10px 0 0">${qrBlock(source)}</div>` : '',
  ].join('');
}

/** شريط بلون المؤسسة يفصل التوقيع عن نص الرسالة. */
function bannerLayout(source: SignatureSource): string {
  const cells = [cell([identityBlock(source), contactBlock(source)].join(''), 'padding:0')];

  if (source.logoUrl) {
    cells.push(cell(image(source.logoUrl, 48, source.organizationName ?? '', '0'), 'padding:0 14px 0 0;width:48px'));
  } else if (source.qrUrl) {
    cells.push(cell(qrBlock(source), 'padding:0 14px 0 0;width:76px;text-align:center'));
  }

  // الشريط `border-top` لا عنصر مستقل: عنصر بارتفاع 3px وخلفية ملوّنة
  // ينهار إلى صفر في Outlook، والحدّ لا ينهار.
  return [
    `<div style="border-top:3px solid ${cssColor(source.accentColor)};padding-top:10px">`,
    row(cells, source),
    '</div>',
  ].join('');
}

// ---------------------------------------------------------------
// الكتل
// ---------------------------------------------------------------

function identityBlock(source: SignatureSource): string {
  const lines = [
    `<div style="margin:0;font-size:15px">${strong(source.fullName, source.accentColor)}</div>`,
  ];

  if (source.jobTitle) {
    lines.push(`<div style="margin:2px 0 0;color:${MUTED}">${escapeHtml(source.jobTitle)}</div>`);
  }

  const organization = [source.department, source.organizationName].filter(Boolean).join(' — ');
  if (organization) {
    lines.push(`<div style="margin:2px 0 0;color:${MUTED}">${escapeHtml(organization)}</div>`);
  }

  return lines.join('');
}

function contactBlock(source: SignatureSource): string {
  const lines: string[] = [];

  if (source.phone) {
    lines.push(contactLine(source.labels.phone, `tel:${source.phone}`, source.phone, source));
  }
  if (source.email) {
    lines.push(contactLine(source.labels.email, `mailto:${source.email}`, source.email, source));
  }
  if (source.website) {
    lines.push(
      contactLine(source.labels.website, source.website, displayUrl(source.website), source),
    );
  }

  const social = source.socialLinks
    .map((link) => anchor(link.url, link.label, source.accentColor))
    .join(muted(' · '));

  const parts = [
    lines.length > 0 ? `<div style="margin:8px 0 0">${lines.join('')}</div>` : '',
    social ? `<div style="margin:6px 0 0">${social}</div>` : '',
    `<div style="margin:8px 0 0">${anchor(source.cardUrl, source.labels.viewCard, source.accentColor, true)}</div>`,
  ];

  return parts.join('');
}

function contactLine(
  label: string,
  href: string,
  display: string,
  source: SignatureSource,
): string {
  return [
    '<div style="margin:0">',
    `<span style="color:${MUTED}">${escapeHtml(label)}: </span>`,
    // الأرقام والبريد بـdir="ltr" دائماً حتى داخل توقيع عربي: ‎+968…
    // يُعرض معكوساً في سياق RTL فيصير رقماً آخر.
    `<span dir="ltr">${anchor(href, display, source.accentColor)}</span>`,
    '</div>',
  ].join('');
}

function inlineContacts(source: SignatureSource): string {
  const parts = [
    source.phone
      ? `<span dir="ltr">${anchor(`tel:${source.phone}`, source.phone, source.accentColor)}</span>`
      : '',
    source.email
      ? `<span dir="ltr">${anchor(`mailto:${source.email}`, source.email, source.accentColor)}</span>`
      : '',
    anchor(source.cardUrl, source.labels.viewCard, source.accentColor, true),
  ].filter(Boolean);

  return parts.join(muted(' · '));
}

function qrBlock(source: SignatureSource): string {
  if (!source.qrUrl) return '';

  return [
    `<a href="${escapeAttribute(safeUrl(source.cardUrl))}" style="text-decoration:none">`,
    image(source.qrUrl, 72, source.labels.viewCard, '4px'),
    '</a>',
  ].join('');
}

function disclaimerBlock(source: SignatureSource): string {
  if (!source.disclaimer) return '';

  return [
    `<div style="margin:12px 0 0;padding-top:8px;border-top:1px solid #e5e7eb;`,
    `font-size:11px;line-height:1.4;color:${MUTED}">`,
    escapeHtml(source.disclaimer),
    '</div>',
  ].join('');
}

// ---------------------------------------------------------------
// لبنات HTML
// ---------------------------------------------------------------

function row(cells: string[], source: SignatureSource): string {
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="${source.direction}"`,
    ' style="border-collapse:collapse">',
    `<tr>${cells.join('')}</tr>`,
    '</table>',
  ].join('');
}

function cell(content: string, style: string): string {
  return `<td valign="top" style="${style}">${content}</td>`;
}

/**
 * صورة بأبعاد صريحة في السمات **و** في النمط.
 *
 * التكرار مقصود: Outlook يتجاهل `style` على `<img>` أحياناً ويقرأ
 * `width`/`height`، وعميل آخر يفعل العكس. صورة بلا أبعاد صريحة تظهر
 * بحجمها الأصلي — أي صورة شخصية بعرض 1024 بكسل في توقيع بريد.
 */
function image(url: string, size: number, alt: string, radius: string): string {
  return [
    `<img src="${escapeAttribute(safeUrl(url))}" alt="${escapeAttribute(alt)}"`,
    ` width="${size}" height="${size}"`,
    ` style="display:block;width:${size}px;height:${size}px;border:0;border-radius:${radius};object-fit:cover" />`,
  ].join('');
}

function anchor(href: string, text: string, color: string, bold = false): string {
  return [
    `<a href="${escapeAttribute(safeUrl(href))}"`,
    ` style="color:${cssColor(color)};text-decoration:none${bold ? ';font-weight:600' : ''}">`,
    escapeHtml(text),
    '</a>',
  ].join('');
}

function strong(text: string, color: string): string {
  return `<span style="font-weight:700;color:${cssColor(color)}">${escapeHtml(text)}</span>`;
}

function muted(text: string): string {
  return `<span style="color:${MUTED}">${escapeHtml(text)}</span>`;
}

// ---------------------------------------------------------------
// النسخة النصية
// ---------------------------------------------------------------

function renderText(source: SignatureSource): string {
  const lines = [
    source.fullName,
    source.jobTitle,
    [source.department, source.organizationName].filter(Boolean).join(' — ') || null,
    '',
    source.phone ? `${source.labels.phone}: ${source.phone}` : null,
    source.email ? `${source.labels.email}: ${source.email}` : null,
    source.website ? `${source.labels.website}: ${source.website}` : null,
    ...source.socialLinks.map((link) => `${link.label}: ${link.url}`),
    source.cardUrl,
    source.disclaimer ? `\n${source.disclaimer}` : null,
  ];

  return lines.filter((line) => line !== null).join('\n').trim();
}

// ---------------------------------------------------------------
// التنقية
// ---------------------------------------------------------------

/**
 * يمنع حقن HTML عبر محتوى البطاقة.
 *
 * ليست حماية نظرية: الاسم والمسمى الوظيفي نصوص يكتبها المستخدم، وناتج
 * هذه الدالة يُلصق في **رسائل بريد يقرأها أطراف خارجيون**. وسم يفلت من
 * هنا لا يضر صاحبه بل من راسله.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

/**
 * يقصر الروابط على المخططات الآمنة.
 *
 * `javascript:` هو الحالة المعروفة، لكن `data:` أخطر هنا: بعض العملاء
 * يعرض `data:text/html` داخلياً، فيصير رابط في توقيع صفحةً كاملة يتحكم
 * بها من كتب البطاقة.
 */
export function safeUrl(url: string): string {
  const normalized = url.trim();

  if (/^(https?:|mailto:|tel:)/i.test(normalized)) {
    return normalized;
  }

  return '#';
}

/**
 * يقصر اللون على HEX.
 *
 * القيمة تصل من إعداد يحفظه المستخدم، وتُدرج في `style`. لون غير مفحوص
 * يسمح بإغلاق الخاصية وحقن خصائص أخرى — `#fff;position:fixed` مثلاً.
 */
export function cssColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : DEFAULT_ACCENT_COLOR;
}

/** يختصر الرابط للعرض: النطاق وحده أوضح من رابط طويل في توقيع. */
function displayUrl(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}
