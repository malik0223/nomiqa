/**
 * الأنواع المشتركة بين Web وAPI وWorker.
 * لا تضع هنا منطق أعمال ولا اعتماديات على قاعدة البيانات.
 */

export * from './analytics.js';
export * from './billing.js';
export * from './branding.js';
export * from './card.js';
export * from './contact.js';
export * from './email.js';
export * from './presence.js';
export * from './privacy.js';
export * from './sales.js';
export * from './support.js';
export * from './team.js';

export type Locale = 'ar' | 'en';

/** صيغة الخطأ الموحدة عبر كل مسارات الـAPI (§5.5 من وثيقة المعمارية). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
    requestId?: string;
  };
}

/** غلاف الصفحات الموحّد لكل قوائم الـAPI. */
export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ---------- الهوية ----------

/**
 * هوية المستخدم المستخرجة من Auth0 Access Token بعد التحقق،
 * مدموجة مع سجل المستخدم المحلي.
 */
export interface AuthenticatedUser {
  /** المعرّف المحلي في قاعدة بياناتنا. */
  id: string;
  /** الـsub القادم من Auth0. */
  auth0UserId: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
}

/**
 * صلاحية ممنوحة على إدارة أو فرع لا على المؤسسة كلها (§9.2).
 */
export interface ScopedPermission {
  permission: string;
  scopeType: 'department' | 'branch';
  scopeId: string;
}

/**
 * سياق المؤسسة النشطة للطلب.
 * الصلاحيات تُقرأ من قاعدة بياناتنا وليس من الـToken.
 */
export interface TenantContext {
  organizationId: string;
  membershipId: string;
  roles: string[];
  /**
   * صلاحيات على **المؤسسة كلها**.
   *
   * التفويض المحدود لا يدخل هنا إطلاقاً: كل مسار قائم يقرأ هذا الحقل
   * بافتراض أنه شامل، وحقن صلاحية بنطاق فيه كان يوسّع كل واحد منها.
   */
  permissions: string[];
  /** التفويضات المحدودة. تُفحص في الخدمة على الصف المستهدف لا في الحارس. */
  scopedPermissions: ScopedPermission[];
  /** المؤسسة معلَّقة إدارياً — القراءة مسموحة والكتابة مرفوضة. */
  suspended: boolean;
}

export interface RequestContext {
  requestId: string;
  user: AuthenticatedUser | null;
  tenant: TenantContext | null;
}

/** مؤسسة كما تظهر للمستخدم الحالي، مع دوره فيها. */
export interface MyOrganization {
  id: string;
  slug: string;
  name: string;
  kind: string;
  defaultLocale: string;
  roles: string[];
  permissions: string[];
}

/**
 * استجابة مسار الإقلاع `/me`.
 *
 * كل مستخدم يملك مؤسسة واحدة على الأقل تُنشأ عند أول دخول،
 * فلا يوجد حالة `organizations` فارغة في التشغيل الطبيعي.
 */
export interface MeResponse {
  user: AuthenticatedUser;
  organizations: MyOrganization[];
  /** الرايات مقيَّمة للمؤسسة الأولى. راية غير مذكورة = مطفأة. */
  featureFlags: Record<string, boolean>;
}

// ---------- الصحة ----------

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; message?: string }>;
}

// ---------- أحداث Outbox ----------

export const OUTBOX_EVENT_TYPES = {
  USER_REGISTERED: 'user.registered',
  ORGANIZATION_CREATED: 'organization.created',
  MEMBERSHIP_REVOKED: 'membership.revoked',
  CARD_PUBLISHED: 'card.published',
  CONTACT_CAPTURED: 'contact.captured',
  // المرحلة 4
  MEMBER_INVITED: 'member.invited',
  INVITATION_ACCEPTED: 'invitation.accepted',
  MEMBER_OFFBOARDED: 'member.offboarded',
  CHANGE_REQUEST_SUBMITTED: 'change_request.submitted',
  CHANGE_REQUEST_REVIEWED: 'change_request.reviewed',
  SUBSCRIPTION_ACTIVATED: 'subscription.activated',
  SUBSCRIPTION_CANCELED: 'subscription.canceled',
  INVOICE_ISSUED: 'invoice.issued',
  INVOICE_PAID: 'invoice.paid',
  PAYMENT_FAILED: 'payment.failed',
  ORGANIZATION_SUSPENDED: 'organization.suspended',
  // المرحلة 6
  //
  // الفعالية تُغلق مرةً واحدة ويُرسل تقريرها بعدها (§11.3). حدث لا
  // مهمة مجدولة: الإغلاق يقع بمرور وقت النهاية، والـOutbox هو المسار
  // الوحيد في المنصة الذي يحوّل واقعةً في قاعدة البيانات إلى فعل.
  EVENT_ENDED: 'event.ended',
} as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[keyof typeof OUTBOX_EVENT_TYPES];

// ---------- أسماء الطوابير ----------

export const QUEUE_NAMES = {
  EMAIL: 'email',
  IMAGE_PROCESSING: 'image-processing',
  ANALYTICS_INGEST: 'analytics-ingest',
  OUTBOX_DISPATCH: 'outbox-dispatch',
  ACCOUNT_DELETION: 'account-deletion',
  /** استيراد الموظفين ودورة الفوترة وفحص النطاقات (§9.2 و§9.4). */
  EMPLOYEE_IMPORT: 'employee-import',
  BILLING_CYCLE: 'billing-cycle',
  /**
   * استخراج بيانات بطاقة ممسوحة (§11.2).
   *
   * طابور مستقل لأن حمله مختلف نوعاً: نداء شبكي إلى محرك تعرّف ضوئي
   * يستغرق ثوانيَ لكل صورة. وضعه مع التكاملات كان يعني أن معرضاً
   * يمسح مئة بطاقة في ساعة يؤخّر إشعار Webhook عن كل عميل آخر.
   */
  SCAN_EXTRACTION: 'scan-extraction',
  /** تسليم Webhooks ومزامنة CRM — كلاهما نداء صادر قابل للفشل (§11.4). */
  INTEGRATIONS: 'integrations',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
