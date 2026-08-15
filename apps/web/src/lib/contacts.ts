import 'server-only';
import type {
  AnalyticsOverview,
  ContactDetail,
  ContactStats,
  ContactSummary,
  Paginated,
  TagData,
} from '@nomiqa/contracts';
import type { AnalyticsQueryInput, ContactQueryInput } from '@nomiqa/validation';
import { apiFetch } from './api-client';

/**
 * قراءات جهات الاتصال والتحليلات.
 *
 * كلها خادمية: البيانات هنا شخصية لأطراف ثالثة، ولا يجوز أن يصل
 * الـAccess Token إلى المتصفح ليقرأها منه أحد.
 */

export async function fetchContacts(
  organizationId: string,
  query: Partial<ContactQueryInput>,
): Promise<Paginated<ContactSummary>> {
  return apiFetch<Paginated<ContactSummary>>(`/contacts${toQueryString(query)}`, {
    organizationId,
  });
}

export async function fetchContact(
  organizationId: string,
  contactId: string,
): Promise<ContactDetail> {
  return apiFetch<ContactDetail>(`/contacts/${contactId}`, { organizationId });
}

export async function fetchContactStats(organizationId: string): Promise<ContactStats> {
  return apiFetch<ContactStats>('/contacts/stats', { organizationId });
}

export async function fetchTags(organizationId: string): Promise<TagData[]> {
  return apiFetch<TagData[]>('/tags', { organizationId });
}

export async function fetchAnalytics(
  organizationId: string,
  query: Partial<AnalyticsQueryInput>,
): Promise<AnalyticsOverview> {
  return apiFetch<AnalyticsOverview>(`/analytics/overview${toQueryString(query)}`, {
    organizationId,
  });
}

/** يبني سلسلة الاستعلام متخطياً القيم الغائبة بدل إرسال `undefined`. */
function toQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}
