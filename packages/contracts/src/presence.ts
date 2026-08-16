/**
 * عقود الحضور المهني المتكامل (خارطة الطريق §10).
 *
 * ثلاث قدرات يجمعها مبدأ واحد: **البطاقة مصدر واحد يظهر في نقاط تواصل
 * كثيرة**. وسم NFC، وبطاقة في محفظة الهاتف، وتوقيع بريد، وخلفية
 * اجتماع، ورمز حملة — كلها واجهات لنفس الرابط الثابت `nomiqa.om/<slug>`
 * الذي رسّخته المرحلة 2. لا تحمل أيٌّ منها نسخة من البيانات، لأن نسخةً
 * تعني بطاقةً لا تُحدَّث بعد طباعتها — وهي المشكلة التي وُجدت المنصة
 * لحلها (§7.4).
 */

// ------------------------------------------------------------
// أهداف المشاركة: الكود القصير
// ------------------------------------------------------------

/**
 * نوع الهدف خلف الكود القصير.
 *
 * وسم NFC وحملة يتشاركان **فضاء أكواد واحداً** لا فضاءين: الكود يظهر
 * في `nomiqa.om/t/<code>`، ولو كان لكل نوع فضاؤه لأمكن أن يوجد كودان
 * متطابقان بمعنيين — ولا يعرف المسار أيهما يقصد الزائر.
 */
export const SHARE_TARGET_KINDS = ['nfc', 'campaign'] as const;
export type ShareTargetKind = (typeof SHARE_TARGET_KINDS)[number];

/**
 * مصدر الزيارة.
 *
 * `direct` ليس غياب مصدر بل قيمته الصريحة: صفٌّ بمصدر فارغ يختلط
 * بصفوف كُتبت قبل وجود الإسناد، والتمييز بينهما مستحيل لاحقاً.
 */
export const SHARE_SOURCES = [
  'direct',
  'qr',
  'nfc',
  'campaign',
  'signature',
  'wallet',
  'meeting',
] as const;
export type ShareSource = (typeof SHARE_SOURCES)[number];

/** طول الكود القصير المولَّد. راجع `share-code.ts` لسبب الأبجدية والطول. */
export const SHARE_CODE_LENGTH = 8;

/**
 * ما يُرجعه المسار العام لحل كود.
 *
 * الغرض إعادة توجيه لا عرض: لا يحمل اسم صاحب البطاقة ولا أي محتوى.
 * كود مسروق من وسم NFC ملقى على طاولة لا يجوز أن يكشف أكثر مما يكشفه
 * فتح البطاقة نفسها.
 */
export interface ShareTargetResolution {
  kind: ShareTargetKind;
  /** الرابط العام الثابت للبطاقة. */
  slug: string;
  source: ShareSource;
  /** معاملات UTM للحملات. فارغ لوسوم NFC. */
  utm: UtmParameters | null;
}

/** معاملات UTM كما تُخزَّن وتُلحق بالرابط. */
export interface UtmParameters {
  source: string;
  medium: string;
  campaign: string;
  term: string | null;
  content: string | null;
}

// ------------------------------------------------------------
// وسوم NFC (§10.2)
// ------------------------------------------------------------

/**
 * حالة الوسم.
 *
 * `revoked` نهائية ولا رجعة فيها: الوسم المفقود قد يكون في يد غريب،
 * وإعادة تفعيله تعيد له وصولاً ظنّ صاحبه أنه أنهاه. البديل المتاح
 * إصدار وسم جديد — وهو ما تفعله «إعادة التعيين» فعلياً.
 */
export const NFC_TAG_STATUSES = ['unassigned', 'active', 'revoked'] as const;
export type NfcTagStatus = (typeof NFC_TAG_STATUSES)[number];

export interface NfcTagSummary {
  id: string;
  code: string;
  label: string | null;
  status: NfcTagStatus;
  cardId: string | null;
  cardSlug: string | null;
  cardOwnerName: string | null;
  /** الرابط الذي يُكتب داخل الوسم. ثابت طوال عمر الوسم. */
  writeUrl: string;
  scanCount: number;
  lastScanAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  createdAt: string;
}

// ------------------------------------------------------------
// الحملات (§10.4)
// ------------------------------------------------------------

export interface CampaignSummary {
  id: string;
  code: string;
  name: string;
  cardId: string;
  cardSlug: string;
  utm: UtmParameters;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  /** مُفعَّلة **و**داخل نافذتها الزمنية الآن. تُحسب في الخادم. */
  isRunning: boolean;
  /** الرابط الذي يُشفَّر في رمز الحملة. */
  shareUrl: string;
  createdAt: string;
}

/** نقطة يومية في تقرير الحملة. */
export interface CampaignSeriesPoint {
  date: string;
  views: number;
  uniqueVisitors: number;
}

export interface CampaignReport {
  campaignId: string;
  name: string;
  range: { from: string; to: string };
  views: number;
  uniqueVisitors: number;
  formSubmits: number;
  /** جهات الاتصال ÷ الزوار الفريدين، بالنسبة المئوية. */
  conversionRate: number;
  series: CampaignSeriesPoint[];
  updatedAt: string | null;
}

/**
 * مقاييس الإسناد في `analytics_rollups`.
 *
 * تعيش في جدول التجميع نفسه لا في جدول جديد: البُعد `dimension` موجود
 * أصلاً لهذا الغرض، وإضافة جدول ثانٍ كانت تعني دورة تجميع ثانية تسقط
 * وحدها دون أن يلاحظ أحد.
 *
 * ولماذا التجميع لا الأحداث الخام: الأحداث تُحذف بعد 90 يوماً (تقليل
 * البيانات)، وتقرير حملة انتهت يجب أن يبقى بعدها.
 */
export const ATTRIBUTION_METRICS = {
  CAMPAIGN_VIEW: 'campaign_view',
  CAMPAIGN_UNIQUE: 'campaign_unique',
  CAMPAIGN_FORM_SUBMIT: 'campaign_form_submit',
  SOURCE_VIEW: 'source_view',
} as const;

// ------------------------------------------------------------
// توقيع البريد (§10.3 و§10.5)
// ------------------------------------------------------------

/**
 * قوالب التوقيع.
 *
 * أربعة تخطيطات لا أكثر: التوقيع يُلصق في محرر بريد لا يملك CSS حديثاً،
 * وكل تخطيط إضافي جدول HTML آخر يجب اختباره على Gmail وOutlook وApple
 * Mail — والثلاثة تتصرف تصرفاً مختلفاً مع الشيء نفسه.
 */
export const SIGNATURE_TEMPLATES = ['classic', 'compact', 'stacked', 'banner'] as const;
export type SignatureTemplateKey = (typeof SIGNATURE_TEMPLATES)[number];

/** عملاء البريد المدعومون بتعليمات لصق مخصصة. */
export const EMAIL_CLIENTS = ['gmail', 'outlook', 'apple_mail'] as const;
export type EmailClient = (typeof EMAIL_CLIENTS)[number];

export interface SignatureOptions {
  /** رمز QR للبطاقة داخل التوقيع. */
  showQr: boolean;
  showAvatar: boolean;
  showLogo: boolean;
  /** روابط التواصل الاجتماعي نصاً — لا أيقونات: الصور الخارجية تُحجب. */
  showSocialLinks: boolean;
  accentColor: string | null;
  /** إخلاء مسؤولية أو نص نظامي يُلحق أسفل التوقيع. */
  disclaimer: string | null;
}

export const DEFAULT_SIGNATURE_OPTIONS: SignatureOptions = {
  showQr: true,
  showAvatar: true,
  showLogo: false,
  showSocialLinks: true,
  accentColor: null,
  disclaimer: null,
};

/**
 * قالب توقيع مؤسسي مركزي (§10.5 خطوة 2).
 *
 * `isEnforced` يقفل اختيار الموظف على هذا القالب. الفرق بينه وبين
 * `isDefault` عملي: الافتراضي اقتراح يُغيَّر، والمفروض سياسة — وتوقيع
 * البريد أكثر ما يظهر من هوية المؤسسة خارجها.
 */
export interface SignatureTemplateSummary {
  id: string;
  name: string;
  templateKey: SignatureTemplateKey;
  options: SignatureOptions;
  isDefault: boolean;
  isEnforced: boolean;
  updatedAt: string;
}

/**
 * التوقيع الجاهز للّصق.
 *
 * `html` و`text` معاً: كل عميل بريد يعرض إحداهما بحسب وضع التحرير،
 * وتوقيع بلا نسخة نصية يظهر فارغاً في رسائل النص الصِّرف.
 */
export interface SignaturePayload {
  cardId: string;
  cardSlug: string;
  templateKey: SignatureTemplateKey;
  options: SignatureOptions;
  locale: string;
  html: string;
  text: string;
  /** مقفل بقالب مؤسسي مفروض — الواجهة تعطّل الاختيار وتشرح السبب. */
  enforced: boolean;
}

// ------------------------------------------------------------
// خلفيات الاجتماعات (§10.3)
// ------------------------------------------------------------

/**
 * منصات الاجتماعات وأبعاد خلفياتها.
 *
 * الثلاث تقبل 1920×1080؛ ما يختلف هو **المنطقة الآمنة**: Teams يقص
 * الحواف، وMeet يضع شريط أدوات أسفل الإطار، وZoom يعكس الصورة أفقياً
 * في المعاينة الذاتية. لذلك الأبعاد واحدة والتخطيط ليس كذلك.
 */
export const MEETING_PLATFORMS = ['zoom', 'teams', 'meet'] as const;
export type MeetingPlatform = (typeof MEETING_PLATFORMS)[number];

export const MEETING_BACKGROUND_SIZE = { width: 1920, height: 1080 } as const;

export interface MeetingBackgroundPayload {
  platform: MeetingPlatform;
  width: number;
  height: number;
  /**
   * الخلفية كـSVG لا PNG.
   *
   * النص يبقى نصاً فيظهر حاداً على أي دقة، والملف كيلوبايتات لا
   * ميغابايتات. التحويل إلى PNG — وهو ما تطلبه منصات الاجتماعات —
   * يحدث في المتصفح عند التنزيل، فلا يحمل الخادم عبء التنقيط.
   */
  svg: string;
}

// ------------------------------------------------------------
// المحافظ الرقمية (§10.2)
// ------------------------------------------------------------

export const WALLET_PLATFORMS = ['apple', 'google'] as const;
export type WalletPlatform = (typeof WALLET_PLATFORMS)[number];

/**
 * بطاقة صادرة في محفظة.
 *
 * `serialNumber` معرّف البطاقة داخل المحفظة، وهو ما يُستخدم لاحقاً
 * لتحديثها أو إبطالها. نحفظه لأن المحفظة لا تقبل بديلاً عنه: بطاقة
 * أصدرناها ولم نحفظ رقمها بطاقةٌ لا نستطيع سحبها من جهاز موظف غادر.
 */
export interface WalletPassSummary {
  id: string;
  platform: WalletPlatform;
  cardId: string;
  serialNumber: string;
  issuedAt: string;
  revokedAt: string | null;
}

/**
 * ناتج طلب إصدار.
 *
 * المنصتان تختلفان جذرياً في آلية التسليم، والعقد يعكس ذلك بدل إخفائه:
 *  - Google: رابط `saveUrl` يحمل JWT موقّعاً، يفتحه المستخدم فتُضاف.
 *  - Apple: ملف `.pkpass` يُنزَّل من مسار الـAPI ويفتحه النظام.
 */
export interface WalletPassIssue {
  platform: WalletPlatform;
  serialNumber: string;
  saveUrl: string | null;
  downloadPath: string | null;
  issuedAt: string;
}

/** جاهزية المنصتين. الواجهة تخفي زراً لا تستطيع المنصة الوفاء به. */
export interface WalletAvailability {
  apple: boolean;
  google: boolean;
}
