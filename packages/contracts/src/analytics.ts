/**
 * عقود التحليلات (§8.4 و§8.5 من خارطة الطريق).
 *
 * قاعدة حاكمة لكل ما في هذا الملف: **لا يُنقل ولا يُخزَّن معرّف يخص
 * زائراً**. لا IP ولا User-Agent ولا كوكي تتبّع. الزائر الفريد تجزئة
 * يومية لا رجعة فيها، وقاعدة احتسابها موثّقة كتابةً في
 * docs/analytics/definitions.md — وهو شرط صريح في خطة العمل §7.2.
 */

export const CARD_EVENT_TYPES = [
  'view',
  'link_click',
  'vcard_download',
  'qr_scan',
  'form_view',
  'form_submit',
] as const;
export type CardEventType = (typeof CARD_EVENT_TYPES)[number];

/** المقاييس المخزَّنة في التجميعات: أنواع الأحداث + الزائر الفريد. */
export const ANALYTICS_METRICS = [...CARD_EVENT_TYPES, 'unique_visitor'] as const;
export type AnalyticsMetric = (typeof ANALYTICS_METRICS)[number];

/**
 * حدث واحد كما يصل الطابور.
 *
 * الـslug لا معرّف البطاقة: المعرّف لا يظهر في أي مكان يراه الزائر،
 * وتمريره عبر المتصفح يكشف مفتاحاً داخلياً بلا فائدة.
 *
 * **ومفاتيحه أسماء أعمدة `analytics_ingest` حرفياً.**
 * `jsonb_to_recordset` تطابق بالاسم، فالدالة تعلن أعمدتها بـcamelCase
 * مقتبسة لتطابق هذا العقد — قرار متّخذ في مهاجرة
 * `20260816020000_analytics_ingest_keys` بعد خلل أسقط كل حدث بصمت.
 *
 * إعادة تسمية حقل هنا توجب تعديل الدالة في مهاجرة جديدة، وإلا
 * يصل العمود NULL ويُسقط الصف **بلا خطأ واحد في السجلات**.
 * يحرسه اختبار تكامل في `presence.integration.test.ts`.
 */
export interface AnalyticsIngestEvent {
  slug: string;
  type: CardEventType;
  linkId: string | null;
  /** تُحسب في الـAPI من مكوّنات لا تُخزَّن. */
  visitorHash: string;
  locale: string | null;
  referrerHost: string | null;
  deviceType: string | null;
  /**
   * مصدر الزيارة كما وصل من الصفحة العامة (§10.4).
   *
   * قيمة من `SHARE_SOURCES` أو null لصف كُتب قبل وجود الإسناد.
   */
  source: string | null;
  /**
   * كود الحملة لا معرّفها.
   *
   * الترجمة إلى معرّف تحدث في دالة الإدراج داخل قاعدة البيانات: مسار
   * الاستقبال العام لا يستعلم عن شيء — وهو الشرط الذي جعل تحميل
   * الصفحة العامة رخيصاً منذ المرحلة 3. وكود لا يقابله حملة نشطة
   * يسقط إلى null بدل أن يُسقط الحدث كله.
   */
  campaignCode: string | null;
  occurredAt: string;
}

export interface AnalyticsIngestJobData {
  events: AnalyticsIngestEvent[];
}

export interface AnalyticsSummary {
  views: number;
  /** فريد **لكل يوم**. لا يُجمع عبر الأيام — راجع وثيقة التعريفات. */
  uniqueVisitors: number;
  linkClicks: number;
  vcardDownloads: number;
  qrScans: number;
  formViews: number;
  formSubmits: number;
  /** جهات الاتصال المكتملة ÷ الزوار الفريدين، بالنسبة المئوية. */
  conversionRate: number;
}

/** نقطة في السلسلة الزمنية اليومية. */
export interface AnalyticsSeriesPoint {
  /** بداية اليوم بصيغة ISO. */
  date: string;
  views: number;
  uniqueVisitors: number;
  linkClicks: number;
  formSubmits: number;
}

export interface AnalyticsTopLink {
  linkId: string;
  type: string;
  platform: string | null;
  label: string | null;
  value: string;
  clicks: number;
}

/** بطاقة في مقارنة الأداء. */
export interface AnalyticsCardBreakdown {
  cardId: string;
  slug: string;
  fullName: string;
  views: number;
  uniqueVisitors: number;
  formSubmits: number;
}

/**
 * توزيع الزيارات على نقاط التواصل (§10.4).
 *
 * يجيب عن السؤال الذي لا تجيب عنه أرقام المشاهدات: **أي نقطة تواصل
 * تعمل فعلاً؟** وسم NFC في مكتب الاستقبال، أو رمز على لافتة، أو رابط
 * في توقيع البريد — الإنفاق عليها يختلف، فيجب أن يختلف قياسها.
 */
export interface AnalyticsSourceBreakdown {
  /** قيمة من `SHARE_SOURCES`. */
  source: string;
  views: number;
}

export interface AnalyticsOverview {
  range: { from: string; to: string };
  summary: AnalyticsSummary;
  series: AnalyticsSeriesPoint[];
  topLinks: AnalyticsTopLink[];
  cards: AnalyticsCardBreakdown[];
  /**
   * الزيارات المعروف مصدرها فقط.
   *
   * مجموعها أقل من `summary.views` دائماً: الزيارة المباشرة من رابط
   * مُشارَك لا تحمل مصدراً، وحشوها في فئة «أخرى» كان يوحي بقياس لم يقع.
   */
  sources: AnalyticsSourceBreakdown[];
  /**
   * آخر لحظة اكتمل فيها التجميع.
   *
   * تُعرض للمستخدم عمداً: الأرقام تُحدَّث كل بضع دقائق لا فورياً، وإخفاء
   * ذلك يجعل المستخدم يظن أن زيارة للتو ضاعت.
   */
  updatedAt: string | null;
}
