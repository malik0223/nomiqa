/**
 * عقود المبيعات والفعاليات والتكاملات (§11 من خارطة الطريق).
 *
 * تنبيه يسري على الملف كله: كل ما يُلتقط هنا — من مسح بطاقة ورقية أو
 * شارة معرض — بيانات شخصية **لطرف ثالث** التقيناه في العالم المادي ولم
 * يملأ نموذجاً ولم يقرأ نص موافقة. سند حفظها يُكتب مع الصف أو لا يُكتب،
 * تماماً كما في `contact.ts`، وسجل المعالجة يُحدَّث قبل إضافة أي حقل.
 */

// ------------------------------------------------------------
// الفعاليات (§11.3)
// ------------------------------------------------------------

/**
 * حالة الفعالية.
 *
 * محسوبة من النافذة الزمنية لا مخزَّنة: فعالية «جارية» عمودٌ يحتاج من
 * يحدّثه عند حلول موعدها، وأي تأخر في تلك المهمة يجعل الشاشة تكذب.
 */
export const EVENT_STATUSES = ['upcoming', 'running', 'ended'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** نوع حقل التأهيل. مغلق عمداً: كل نوع يحتاج عرضاً وتصديراً وتحققاً. */
export const LEAD_QUALIFIER_TYPES = ['select', 'text', 'boolean'] as const;
export type LeadQualifierType = (typeof LEAD_QUALIFIER_TYPES)[number];

/**
 * حقل تأهيل عميل محتمل.
 *
 * يعرّفه منظّم الفعالية قبلها لا مطوّر: «مستوى الاهتمام»، «الميزانية»،
 * «موعد الشراء». يُخزَّن مع جهة الاتصال قيمةً لا مرجعاً، فحذف الحقل من
 * إعداد الفعالية لاحقاً لا يمحو ما جمعه المندوب في القاعة.
 */
export interface LeadQualifier {
  key: string;
  label: string;
  labelEn: string | null;
  type: LeadQualifierType;
  /** خيارات `select` وحده. مصفوفة فارغة لغيره. */
  options: string[];
  required: boolean;
}

export interface EventSummary {
  id: string;
  name: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  /** البطاقات المخصصة للفعالية — كل التقاط عبرها يُصنَّف إليها آلياً. */
  cardIds: string[];
  qualifiers: LeadQualifier[];
  /** كلفة المشاركة بالبيسة. أساس «كلفة العميل المحتمل» في التقرير. */
  costBaisa: number | null;
  targetLeads: number | null;
  /** عدد العملاء المحتملين المسجّلين حتى اللحظة. */
  leadCount: number;
  createdAt: string;
}

/** أداء عضو فريق في فعالية (§11.3 — مقارنة أداء أعضاء الفريق). */
export interface EventMemberPerformance {
  userId: string;
  fullName: string | null;
  leads: number;
  qualifiedLeads: number;
  /** التقاطات موسومة تكراراً لجهة اتصال أقدم في المؤسسة. */
  duplicates: number;
}

export interface EventLeadsPoint {
  date: string;
  leads: number;
}

/**
 * تقرير الفعالية (§11.3).
 *
 * يُقرأ من صفوف جهات الاتصال لا من التجميعات التحليلية: العميل المحتمل
 * صفٌّ دائم لا حدث قياس يُحذف بعد 90 يوماً، وتقرير ما بعد الفعالية
 * يُطلب بعد شهور — أحياناً لتبرير المشاركة في نسختها القادمة.
 */
export interface EventReport {
  eventId: string;
  name: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  leads: number;
  qualifiedLeads: number;
  duplicates: number;
  /** التقاطات وصلت من مسح بطاقة أو شارة لا من نموذج البطاقة. */
  scannedLeads: number;
  /** نسبة من مُلئت له حقول التأهيل من إجمالي الملتقَطين. */
  qualificationRate: number;
  costBaisa: number | null;
  /** كلفة العميل المحتمل الواحد بالبيسة. null بلا كلفة معلنة. */
  costPerLeadBaisa: number | null;
  targetLeads: number | null;
  members: EventMemberPerformance[];
  series: EventLeadsPoint[];
  /** توزيع القيم لكل حقل تأهيل: { qualifierKey: { value: count } }. */
  qualifierBreakdown: Record<string, Record<string, number>>;
}

// ------------------------------------------------------------
// المسح والاستخراج (§11.2)
// ------------------------------------------------------------

/** ما يُمسح. لكل نوع مسار استخراج مختلف تماماً. */
export const SCAN_KINDS = ['business_card', 'badge', 'qr'] as const;
export type ScanKind = (typeof SCAN_KINDS)[number];

/**
 * حالة عملية المسح.
 *
 * `review` حالة قائمة بذاتها لا تفصيلة واجهة: **لا يُكتب صف جهة اتصال
 * من مخرَج آلي بلا مراجعة إنسان** (§11.2). التعرّف الضوئي على العربية
 * يخطئ في الأسماء والألقاب، وصفٌّ خاطئ في قاعدة عملاء يُرسَل إليه بريد
 * باسم شخص آخر.
 */
export const SCAN_STATUSES = [
  'pending',
  'processing',
  'review',
  'saved',
  'failed',
  'discarded',
] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

/** حقل استُخرج من صورة، بثقته. */
export interface ExtractedField {
  value: string;
  /** 0–1. المنخفض يُعلَّم في الواجهة ليراجعه الإنسان أولاً. */
  confidence: number;
}

/**
 * ناتج الاستخراج المعروض للمراجعة.
 *
 * الحقول كلها اختيارية: بطاقة ورقية قد لا تحمل بريداً، وشارة معرض قد
 * تحمل الاسم والمؤسسة وحدهما. إجبار أي حقل هنا كان يعني رفض ما التُقط
 * فعلاً لأنه ناقص.
 */
export interface ExtractedContact {
  fullName?: ExtractedField;
  email?: ExtractedField;
  phone?: ExtractedField;
  organizationName?: ExtractedField;
  jobTitle?: ExtractedField;
  website?: ExtractedField;
}

export interface ScanJobSummary {
  id: string;
  kind: ScanKind;
  status: ScanStatus;
  eventId: string | null;
  extracted: ExtractedContact;
  /** ثقة الاستخراج الإجمالية. null قبل المعالجة. */
  confidence: number | null;
  /** سبب الفشل بلغة المستخدم. لا يحمل نصاً مستخرجاً من الصورة. */
  error: string | null;
  contactId: string | null;
  /** حُذفت صورة المسح — تُحذف عند الحفظ أو الإهمال لا بعد مدة. */
  imageDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** جاهزية محرك الاستخراج، كما تقرؤها الواجهة قبل عرض زر التصوير. */
export interface ScanAvailability {
  /** الميزة مشمولة بالباقة. */
  entitled: boolean;
  /** محرك تعرّف ضوئي مضبوط. بدونه يبقى المسح متاحاً بإدخال يدوي. */
  ocrConfigured: boolean;
  provider: string;
}

// ------------------------------------------------------------
// التكاملات: مفاتيح الـAPI (§11.4 خطوة 1)
// ------------------------------------------------------------

/**
 * نطاقات مفتاح الـAPI.
 *
 * منفصلة تماماً عن صلاحيات المستخدمين ولا تُشتق منها: المفتاح يمثّل
 * **نظاماً** لا شخصاً، ويعيش في ملف إعداد على خادم عميل. منحه صلاحيات
 * دور «مسؤول» كان يعني أن تسريب ملف إعداد يساوي تسريب حساب مسؤول.
 */
export const API_KEY_SCOPES = [
  'contacts:read',
  'contacts:write',
  'events:read',
  'cards:read',
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** بادئة كل مفتاح. تُميّزه في السجلات وفي فحص الأسرار المسرَّبة. */
export const API_KEY_PREFIX = 'nmq';

export interface ApiKeySummary {
  id: string;
  name: string;
  /** المقطع المعلَن من المفتاح. يكفي لتمييزه ولا يكفي لاستخدامه. */
  prefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * المفتاح لحظة إنشائه.
 *
 * `token` يظهر **مرة واحدة**: نخزّن تجزئته لا قيمته، فلا سبيل إلى
 * عرضه ثانيةً — وهو الفارق بين مفتاح مسروق يُستخدم ومفتاح مسروق يُبطَل.
 */
export interface ApiKeyIssued extends ApiKeySummary {
  token: string;
}

// ------------------------------------------------------------
// التكاملات: Webhooks
// ------------------------------------------------------------

/**
 * الأحداث القابلة للاشتراك.
 *
 * مجموعة فرعية من أحداث الـOutbox لا كلها: حدث داخلي كـ
 * `membership.revoked` يصف تنظيم المؤسسة لا عملها، وبثّه إلى نظام
 * خارجي توسيعٌ للسطح بلا طلب.
 */
export const WEBHOOK_EVENT_TYPES = [
  'contact.captured',
  'card.published',
  'invoice.paid',
  'subscription.activated',
  'subscription.canceled',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'delivered', 'failed'] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

/** ترويسات التوقيع. أسماؤها جزء من العقد المعلَن للعملاء. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-nomiqa-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-nomiqa-timestamp';
export const WEBHOOK_EVENT_ID_HEADER = 'x-nomiqa-event-id';

/**
 * نافذة قبول الطابع الزمني عند المستقبِل، بالثواني.
 *
 * معلنة في العقد لا خياراً لنا وحدنا: المستقبِل هو من يرفض التوقيع
 * القديم، وبلا رقم متفق عليه يصير كل تنفيذ مختلفاً.
 */
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export interface WebhookEndpointSummary {
  id: string;
  url: string;
  description: string | null;
  eventTypes: WebhookEventType[];
  isActive: boolean;
  /** أُوقف آلياً بعد فشل متكرر. يحتاج تفعيلاً يدوياً بعد إصلاح الوجهة. */
  disabledAt: string | null;
  disabledReason: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
}

/** الوجهة لحظة إنشائها — السرّ يظهر مرة واحدة كالمفتاح. */
export interface WebhookEndpointIssued extends WebhookEndpointSummary {
  secret: string;
}

export interface WebhookDeliverySummary {
  id: string;
  eventType: WebhookEventType;
  eventId: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

// ------------------------------------------------------------
// التكاملات: مزامنة CRM (§11.5)
// ------------------------------------------------------------

/**
 * مزوّدو CRM المدعومون.
 *
 * الترتيب هو ترتيب §11.4 نفسه. `hubspot` أولاً لأنه الوحيد الذي يعمل
 * برمز تطبيق خاص بلا دورة OAuth كاملة — أي يمكن للمؤسسة وصله بنفسها
 * اليوم دون أن نسجّل تطبيقاً في سوق كل مزوّد.
 */
export const CRM_PROVIDERS = ['hubspot'] as const;
export type CrmProvider = (typeof CRM_PROVIDERS)[number];

export const CRM_CONNECTION_STATUSES = ['active', 'paused', 'error'] as const;
export type CrmConnectionStatus = (typeof CRM_CONNECTION_STATUSES)[number];

/**
 * حقول جهة الاتصال القابلة للمزامنة.
 *
 * قائمة مغلقة: الخريطة تُملأ من الواجهة، وحقلٌ حر كان يسمح بإرسال أي
 * عمود إلى نظام خارجي — بما فيه `message`، وهو نص كتبه زائر لصاحب
 * البطاقة وحده.
 */
export const CRM_SYNCABLE_FIELDS = [
  'fullName',
  'email',
  'phone',
  'organizationName',
  'jobTitle',
] as const;
export type CrmSyncableField = (typeof CRM_SYNCABLE_FIELDS)[number];

/**
 * من يُسجَّل مالكاً للعميل المحتمل في الـCRM (§11.5).
 *
 * `capturer` الافتراضي: من التقى العميل هو من يتابعه. `fixed` لفرق
 * توزّع المتابعة على مسؤول واحد بعد الفعالية.
 */
export const CRM_OWNER_STRATEGIES = ['capturer', 'fixed', 'unassigned'] as const;
export type CrmOwnerStrategy = (typeof CRM_OWNER_STRATEGIES)[number];

export const CRM_SYNC_STATUSES = ['pending', 'success', 'failed', 'skipped'] as const;
export type CrmSyncStatus = (typeof CRM_SYNC_STATUSES)[number];

export interface CrmConnectionSummary {
  id: string;
  provider: CrmProvider;
  status: CrmConnectionStatus;
  /** خريطة الحقول: حقلنا ← اسم الحقل عند المزوّد. */
  fieldMap: Partial<Record<CrmSyncableField, string>>;
  ownerStrategy: CrmOwnerStrategy;
  /** معرّف المالك عند المزوّد حين تكون الاستراتيجية `fixed`. */
  ownerRef: string | null;
  /** يقتصر الإرسال على جهات اتصال منحت الموافقة التسويقية. */
  marketingConsentOnly: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  pending: number;
  failed: number;
  createdAt: string;
}

export interface CrmSyncLogEntry {
  id: string;
  contactId: string;
  contactName: string;
  status: CrmSyncStatus;
  operation: string | null;
  remoteId: string | null;
  attempts: number;
  error: string | null;
  nextAttemptAt: string | null;
  syncedAt: string | null;
  createdAt: string;
}

/**
 * الخريطة الافتراضية عند إنشاء وصلة HubSpot.
 *
 * `fullName ← firstname` مقصود رغم أنه يبدو خطأً: HubSpot لا يملك
 * حقل «الاسم الكامل»، وتقسيم الاسم العربي إلى أول وأخير تخمينٌ يخطئ
 * كثيراً — «سالم بن راشد الهنائي» ليس اسمين. وضعه كاملاً في `firstname`
 * يُظهره صحيحاً في كل شاشة عندهم، ومن يريد التقسيم يغيّر الخريطة.
 */
export const HUBSPOT_DEFAULT_FIELD_MAP: Record<CrmSyncableField, string> = {
  fullName: 'firstname',
  email: 'email',
  phone: 'phone',
  organizationName: 'company',
  jobTitle: 'jobtitle',
};

// ------------------------------------------------------------
// حمولات المهام الخلفية
// ------------------------------------------------------------

export interface ScanExtractionJobData {
  scanJobId: string;
  organizationId: string;
}

export interface CrmSyncJobData {
  connectionId: string;
  organizationId: string;
  contactId: string;
}
