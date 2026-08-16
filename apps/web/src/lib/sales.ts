import 'server-only';
import type {
  ApiKeySummary,
  CrmConnectionSummary,
  CrmSyncLogEntry,
  EventReport,
  EventSummary,
  ScanAvailability,
  ScanJobSummary,
  WebhookDeliverySummary,
  WebhookEndpointSummary,
} from '@nomiqa/contracts';
import { apiFetch } from './api-client';

/**
 * قراءات المبيعات والفعاليات والتكاملات (المرحلة 6).
 *
 * كلها خادمية بلا استثناء: قائمة العملاء المحتملين وتقرير الفعالية
 * ومفاتيح الـAPI ووصلات الـCRM — أربعتها تكشف إما بيانات أشخاص لم
 * يسجّلوا في المنصة، وإما مفاتيح تفتحها. لا شيء منها يحتمل رمز وصول
 * في المتصفح.
 */

export async function fetchEvents(organizationId: string): Promise<EventSummary[]> {
  return apiFetch<EventSummary[]>('/events', { organizationId });
}

export async function fetchEventReport(
  organizationId: string,
  eventId: string,
): Promise<EventReport> {
  return apiFetch<EventReport>(`/events/${eventId}/report`, { organizationId });
}

export async function fetchScanAvailability(organizationId: string): Promise<ScanAvailability> {
  return apiFetch<ScanAvailability>('/scans/availability', { organizationId });
}

export async function fetchPendingScans(organizationId: string): Promise<ScanJobSummary[]> {
  return apiFetch<ScanJobSummary[]>('/scans', { organizationId });
}

export async function fetchApiKeys(organizationId: string): Promise<ApiKeySummary[]> {
  return apiFetch<ApiKeySummary[]>('/integrations/api-keys', { organizationId });
}

export async function fetchWebhooks(organizationId: string): Promise<WebhookEndpointSummary[]> {
  return apiFetch<WebhookEndpointSummary[]>('/integrations/webhooks', { organizationId });
}

export async function fetchWebhookDeliveries(
  organizationId: string,
  endpointId: string,
): Promise<WebhookDeliverySummary[]> {
  return apiFetch<WebhookDeliverySummary[]>(
    `/integrations/webhooks/${endpointId}/deliveries`,
    { organizationId },
  );
}

export async function fetchCrmConnections(
  organizationId: string,
): Promise<CrmConnectionSummary[]> {
  return apiFetch<CrmConnectionSummary[]>('/integrations/crm', { organizationId });
}

export async function fetchCrmLogs(
  organizationId: string,
  connectionId: string,
): Promise<CrmSyncLogEntry[]> {
  return apiFetch<CrmSyncLogEntry[]>(`/integrations/crm/${connectionId}/logs`, {
    organizationId,
  });
}

/**
 * الفعاليات الجارية وحدها.
 *
 * شاشة المسح تعرضها لا كلَّها: المندوب في قاعة معرض يسجّل تحت الفعالية
 * التي يقف فيها، وقائمة تحوي معرض العام الماضي تجعل اختياره خطأً
 * وارداً — والخطأ هنا يفسد تقريرين معاً.
 */
export function runningEvents(events: EventSummary[]): EventSummary[] {
  return events.filter((event) => event.status === 'running');
}
