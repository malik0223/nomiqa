import 'server-only';
import { apiFetch } from './api-client';

/**
 * قراءات لوحة إدارة المنصة (§12).
 *
 * الأنواع معرّفة هنا لا في `@nomiqa/contracts` عن قصد: مسارات الإدارة
 * في الـAPI تُرجع أشكالاً مستنتجة من Prisma ولا تُصرّح بعقد مشترك،
 * فوضع نسخة في العقود كان يوهم بضمانٍ لا يفرضه أحد. حين يتبنّى الـAPI
 * عقداً لهذه المسارات تنتقل هذه الأنواع إليه.
 *
 * لا `organizationId` في أيٍّ من النداءات: المسارات موسومة
 * بـ`@NoTenantRequired` لأنها تتجاوز حدود المؤسسات أصلاً.
 */

export interface PlatformTotals {
  users: number;
  organizations: number;
  activeMemberships: number;
  files: number;
}

export interface AdminOrganization {
  id: string;
  slug: string;
  name: string;
  kind: string;
  defaultLocale: string;
  createdAt: string;
  memberCount: number;
  fileCount: number;
}

export interface AdminPage<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AdminPlanPrice {
  id: string;
  interval: string;
  currency: string;
  amountBaisa: number;
  isActive: boolean;
}

export interface AdminPlan {
  id: string;
  key: string;
  name: string;
  nameEn: string | null;
  limits: Record<string, number>;
  features: string[];
  trialDays: number;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  subscriberCount: number;
  prices: AdminPlanPrice[];
}

export interface AdminRevenue {
  period: { from: string; to: string };
  totals: Array<{
    currency: string;
    paidInvoices: number;
    paidBaisa: number;
    vatBaisa: number;
    discountBaisa: number;
  }>;
  byMonth: Array<{ month: string; currency: string; paidBaisa: number }>;
  subscriptions: Array<{ planKey: string; status: string; count: number; seats: number }>;
}

export interface AdminFeatureFlag {
  key: string;
  description: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  overrides: Array<{ organizationId: string; enabled: boolean }>;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  occurredAt: string;
  ipAddress: string | null;
}

export function fetchPlatformTotals(): Promise<PlatformTotals> {
  return apiFetch<PlatformTotals>('/admin/stats');
}

export function fetchOrganizations(page = 1, pageSize = 25): Promise<AdminPage<AdminOrganization>> {
  return apiFetch<AdminPage<AdminOrganization>>(
    `/admin/organizations?page=${page}&pageSize=${pageSize}`,
  );
}

export function fetchPlans(): Promise<AdminPlan[]> {
  return apiFetch<AdminPlan[]>('/admin/plans');
}

export function fetchRevenue(months = 6): Promise<AdminRevenue> {
  return apiFetch<AdminRevenue>(`/admin/revenue?months=${months}`);
}

export function fetchFeatureFlags(): Promise<AdminFeatureFlag[]> {
  return apiFetch<AdminFeatureFlag[]>('/admin/feature-flags');
}

export function fetchAudit(page = 1, pageSize = 20): Promise<AdminPage<AdminAuditEntry>> {
  return apiFetch<AdminPage<AdminAuditEntry>>(`/admin/audit?page=${page}&pageSize=${pageSize}`);
}

/** البيسة إلى ريال. 1 ريال = 1000 بيسة، والقيم تُخزَّن صحيحةً بالبيسة. */
export function formatOmr(baisa: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-OM' : 'ar-OM', {
    style: 'currency',
    currency: 'OMR',
    minimumFractionDigits: 3,
  }).format(baisa / 1000);
}
