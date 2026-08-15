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

export interface AnalyticsOverview {
  range: { from: string; to: string };
  summary: AnalyticsSummary;
  series: AnalyticsSeriesPoint[];
  topLinks: AnalyticsTopLink[];
  cards: AnalyticsCardBreakdown[];
  /**
   * آخر لحظة اكتمل فيها التجميع.
   *
   * تُعرض للمستخدم عمداً: الأرقام تُحدَّث كل بضع دقائق لا فورياً، وإخفاء
   * ذلك يجعل المستخدم يظن أن زيارة للتو ضاعت.
   */
  updatedAt: string | null;
}
