/**
 * الأنواع المشتركة بين Web وAPI وWorker.
 * لا تضع هنا منطق أعمال ولا اعتماديات على قاعدة البيانات.
 */

export * from './card.js';
export * from './email.js';
export * from './privacy.js';

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
 * سياق المؤسسة النشطة للطلب.
 * الصلاحيات تُقرأ من قاعدة بياناتنا وليس من الـToken.
 */
export interface TenantContext {
  organizationId: string;
  membershipId: string;
  roles: string[];
  permissions: string[];
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
} as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[keyof typeof OUTBOX_EVENT_TYPES];

// ---------- أسماء الطوابير ----------

export const QUEUE_NAMES = {
  EMAIL: 'email',
  IMAGE_PROCESSING: 'image-processing',
  ANALYTICS_INGEST: 'analytics-ingest',
  OUTBOX_DISPATCH: 'outbox-dispatch',
  ACCOUNT_DELETION: 'account-deletion',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
