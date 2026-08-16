import type { ExtractedContact } from '@nomiqa/contracts';

/**
 * تحويل نص بطاقة ورقية إلى حقول (§11.2).
 *
 * **هذا ليس محرك تعرّف ضوئي.** المحرك يعطينا سطوراً؛ هذا الملف يقرر
 * أيّ سطر اسمٌ وأيّ سطر مسمّى وظيفي. الفصل مقصود ومكتوب في
 * ADR-016: التعرّف على الحروف خدمة خارجية تُستبدل، أما فهم تخطيط
 * البطاقة العُمانية — سطر عربي فوق سطر إنجليزي، رقم بصيغة محلية، اسم
 * شركة يحمل «ش.م.م» — فمعرفة تخصّنا ولا يبيعها أحد.
 *
 * وكل ما ينتجه هذا الملف **مقترح للمراجعة لا حقيقة**: لا شيء منه يصل
 * جدول جهات الاتصال قبل أن يؤكده إنسان. لذلك تُرجَع كل قيمة بثقتها،
 * والمنخفضة تُعلَّم في الشاشة لتُقرأ أولاً.
 */

/**
 * رمز الدولة الافتراضي للأرقام المحلية.
 *
 * البطاقة العُمانية تكتب `9123 4567` بلا رمز دولة لأن قارئها محلي.
 * تخزينه هكذا يكسر شرط E.164 في كل مسار لاحق — والتصدير إلى CRM
 * يرسله رقماً لا يمكن الاتصال به من الخارج.
 */
export const DEFAULT_COUNTRY_CODE = '+968';

/**
 * درجات الثقة.
 *
 * ثابتة لا محسوبة من المحرك: ثقة المحرك تقيس **قراءة الحروف** لا صحة
 * التصنيف، ونصٌّ مقروء بثقة 0.99 قد يوضع في الحقل الخطأ تماماً. ما
 * نعلنه هنا هو ثقتنا في القاعدة التي صنّفت السطر، وهي ما يحتاج
 * المراجع أن يعرفه.
 */
const CONFIDENCE = {
  /** صيغة لا تحتمل التأويل: بريد، رابط، رقم بصيغة دولية. */
  EXACT: 0.95,
  /** كلمة مفتاحية صريحة في السطر: «مدير»، `LLC`. */
  KEYWORD: 0.8,
  /** موضع في التخطيط: أول سطر صالح للاسم. */
  POSITION: 0.6,
  /** اشتقاق غير مباشر: اسم شركة من نطاق البريد. */
  DERIVED: 0.45,
} as const;

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s]+|\b[\w-]+\.(?:com|net|org|om|ae|sa|io|co)\b/i;

/**
 * مزوّدو بريد عام.
 *
 * وجودهم يمنع اشتقاق اسم الشركة من النطاق: `ahmed@gmail.com` لا يعني
 * أن الرجل يعمل في شركة اسمها Gmail — وهو خطأ يبدو سخيفاً في المثال
 * ومقنعاً جداً في قائمة بمئة عميل.
 */
const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail',
  'googlemail',
  'hotmail',
  'outlook',
  'live',
  'yahoo',
  'icloud',
  'me',
  'proton',
  'protonmail',
  'aol',
  'gmx',
  'zoho',
  'mail',
]);

/** كلمات المسمّى الوظيفي بالعربية والإنجليزية. */
const TITLE_KEYWORDS = [
  'مدير',
  'مديرة',
  'رئيس',
  'رئيسة',
  'نائب',
  'مؤسس',
  'شريك',
  'مستشار',
  'مستشارة',
  'مهندس',
  'مهندسة',
  'أخصائي',
  'اخصائي',
  'مسؤول',
  'مسئول',
  'محاسب',
  'تنفيذي',
  'تنفيذية',
  'المبيعات',
  'التسويق',
  'manager',
  'director',
  'head of',
  'chief',
  'ceo',
  'cto',
  'cfo',
  'coo',
  'founder',
  'partner',
  'engineer',
  'consultant',
  'specialist',
  'officer',
  'executive',
  'supervisor',
  'analyst',
  'developer',
  'designer',
  'accountant',
  'sales',
  'marketing',
];

/** كلمات اسم المنشأة. */
const COMPANY_KEYWORDS = [
  'شركة',
  'مؤسسة',
  'مجموعة',
  'ش.م.م',
  'ش م م',
  'ذ.م.م',
  'للتجارة',
  'للمقاولات',
  'للاستثمار',
  'llc',
  'l.l.c',
  'ltd',
  'limited',
  'inc',
  'co.',
  'company',
  'group',
  'holding',
  'trading',
  'technologies',
  'technology',
  'solutions',
  'services',
  'consulting',
  'enterprises',
  'international',
];

/**
 * كلمات تسبق قيمةً ولا تكون قيمةً: «هاتف:»، `Mobile:`.
 *
 * `www` ليست منها رغم أنها تبدو كذلك: هي **جزء من القيمة** لا وسمٌ
 * لها، وحذفها من `www.alrimal.om` يترك نطاقاً ناقصاً يصل إلى الـCRM
 * كرابط لا يُفتح.
 */
const LABEL_PREFIX =
  /^\s*(?:tel|phone|mobile|fax|email|e-mail|web|هاتف|جوال|نقال|فاكس|بريد|موقع)\s*[:.-]\s*/i;

/**
 * يحوّل نص بطاقة إلى حقول مقترحة.
 *
 * الترتيب مقصود: الحقول القاطعة أولاً (بريد، رابط، هاتف)، ثم تُستبعد
 * سطورها من المرشّحين، ثم يُبحث عن الاسم والمسمّى والشركة فيما بقي.
 * البحث عن الاسم قبل استبعاد سطر البريد كان يجعل `ahmed@x.om` اسماً
 * في كل بطاقة لا تحمل اسماً واضحاً.
 */
export function parseBusinessCard(
  text: string,
  options: { countryCode?: string } = {},
): ExtractedContact {
  const countryCode = options.countryCode ?? DEFAULT_COUNTRY_CODE;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const result: ExtractedContact = {};
  const consumed = new Set<number>();

  lines.forEach((line, index) => {
    const email = EMAIL_PATTERN.exec(line)?.[0];
    if (email && !result.email) {
      result.email = { value: email.toLowerCase(), confidence: CONFIDENCE.EXACT };
      consumed.add(index);
    }
  });

  lines.forEach((line, index) => {
    if (consumed.has(index)) return;

    const phone = extractPhone(line, countryCode);
    if (phone && !result.phone) {
      result.phone = phone;
      consumed.add(index);
    }
  });

  lines.forEach((line, index) => {
    if (consumed.has(index)) return;

    const url = URL_PATTERN.exec(line.replace(LABEL_PREFIX, ''))?.[0];
    if (url && !result.website) {
      result.website = { value: normalizeUrl(url), confidence: CONFIDENCE.EXACT };
      consumed.add(index);
    }
  });

  // المسمّى والشركة بالكلمات المفتاحية: أدق من الموضع، فتُقرأ قبله
  // وتستهلك سطورها — وإلا صار «مدير المبيعات» اسم صاحب البطاقة.
  lines.forEach((line, index) => {
    if (consumed.has(index)) return;

    if (!result.jobTitle && containsKeyword(line, TITLE_KEYWORDS)) {
      result.jobTitle = { value: line, confidence: CONFIDENCE.KEYWORD };
      consumed.add(index);
      return;
    }

    if (!result.organizationName && containsKeyword(line, COMPANY_KEYWORDS)) {
      result.organizationName = { value: line, confidence: CONFIDENCE.KEYWORD };
      consumed.add(index);
    }
  });

  lines.forEach((line, index) => {
    if (consumed.has(index) || result.fullName) return;

    if (looksLikeName(line)) {
      result.fullName = { value: line, confidence: CONFIDENCE.POSITION };
      consumed.add(index);
    }
  });

  // اسم الشركة من نطاق البريد — آخر محاولة وبثقة منخفضة معلنة.
  if (!result.organizationName && result.email) {
    const derived = organizationFromEmail(result.email.value);
    if (derived) {
      result.organizationName = { value: derived, confidence: CONFIDENCE.DERIVED };
    }
  }

  return result;
}

/** متوسط ثقة الحقول المستخرجة. صفر حين لا يُستخرج شيء. */
export function overallConfidence(extracted: ExtractedContact): number {
  const values = Object.values(extracted).filter(
    (field): field is { value: string; confidence: number } => field !== undefined,
  );

  if (values.length === 0) return 0;

  const sum = values.reduce((total, field) => total + field.confidence, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

// ------------------------------------------------------------
// داخلي
// ------------------------------------------------------------

/**
 * يستخرج رقماً ويطبّعه إلى E.164.
 *
 * ما لا يُطبَّع **يُعاد كما هو بثقة منخفضة** لا يُسقط: رقم بصيغة لا
 * نعرفها ما زال رقماً كتبه صاحب البطاقة، وحذفه يجعل المراجع يعيد
 * كتابته من صورة حُذفت. مخطط الحفظ يرفضه إن بقي غير صالح، فيصححه
 * المراجع وهو يرى ما قرأه المحرك.
 */
export function extractPhone(
  line: string,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): { value: string; confidence: number } | null {
  const stripped = line.replace(LABEL_PREFIX, '');
  // نقبل الفواصل الشائعة في الطباعة: مسافة، شرطة، نقطة، أقواس.
  const candidate = /(\+?\d[\d\s().-]{6,})/.exec(stripped)?.[1];

  if (!candidate) return null;

  const digits = candidate.replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) {
    return isE164(digits) ? { value: digits, confidence: CONFIDENCE.EXACT } : null;
  }

  // الاتصال الدولي بصيغة 00 — شائع على البطاقات الخليجية.
  if (digits.startsWith('00')) {
    const international = `+${digits.slice(2)}`;
    return isE164(international)
      ? { value: international, confidence: CONFIDENCE.EXACT }
      : null;
  }

  // رقم محلي بلا رمز دولة: ثمانية أرقام في عُمان، أو تسعة تبدأ بصفر
  // في صيغ إقليمية أخرى.
  //
  // الطول شرطٌ لا زينة: `+968` + سبعة أرقام يعطي سلسلة **صالحة الشكل**
  // بمقياس E.164 وغير قابلة للاتصال بها. رقم بهذا الطول على بطاقة هو
  // امتداد داخلي أو رقم صندوق بريد، وتحويله إلى هاتف دولي يُدخل في
  // قاعدة العملاء رقماً مخترعاً يبدو سليماً.
  const local = digits.startsWith('0') ? digits.slice(1) : digits;
  const composed = `${countryCode}${local}`;

  if (local.length >= 8 && local.length <= 11 && isE164(composed)) {
    return { value: composed, confidence: CONFIDENCE.KEYWORD };
  }

  return { value: candidate.trim(), confidence: CONFIDENCE.POSITION };
}

function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.replace(/[.,;]+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function containsKeyword(line: string, keywords: string[]): boolean {
  const lowered = line.toLowerCase();
  return keywords.some((keyword) => lowered.includes(keyword));
}

/**
 * هل يشبه السطر اسم شخص؟
 *
 * الشروط سالبة أكثر منها موجبة، وهذا مقصود: لا قاعدة تصف أسماء البشر،
 * لكن ما **ليس** اسماً واضح — سطر فيه أرقام، أو سطر من كلمة واحدة، أو
 * سطر طويل جداً هو عنوان لا اسم.
 */
function looksLikeName(line: string): boolean {
  if (/\d/.test(line)) return false;
  if (line.length < 4 || line.length > 60) return false;

  const words = line.split(' ').filter((word) => word.length > 1);
  if (words.length < 2 || words.length > 5) return false;

  // سطر بلا حروف (رموز أو فواصل زخرفية) ليس اسماً.
  return /[\p{L}]/u.test(line);
}

/**
 * يشتق اسم المنشأة من نطاق البريد.
 *
 * `ahmed@alhajri-group.om` ← `Alhajri Group`. تحويلٌ خشن يظهر للمراجع
 * ليصححه، وقيمته أنه يملأ حقلاً كان سيبقى فارغاً في أغلب البطاقات
 * التي لا تكتب اسم الشركة إلا في الشعار — وهو ما لا يقرؤه أي محرك نص.
 */
export function organizationFromEmail(email: string): string | null {
  const domain = email.split('@')[1];
  if (!domain) return null;

  const root = domain.split('.')[0];
  if (!root || PUBLIC_MAIL_DOMAINS.has(root.toLowerCase())) {
    return null;
  }

  return root
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
