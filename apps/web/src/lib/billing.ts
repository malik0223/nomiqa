import 'server-only';
import type {
  InvoiceDetail,
  InvoiceSummary,
  OrganizationEntitlements,
  Paginated,
  PlanSummary,
  SubscriptionSummary,
  TicketDetail,
  TicketSummary,
} from '@nomiqa/contracts';
import { apiFetch } from './api-client';

/** قراءات الفوترة والدعم (المرحلة 4). خادمية كلها. */

export async function fetchPlans(organizationId: string): Promise<PlanSummary[]> {
  return apiFetch<PlanSummary[]>('/billing/plans', { organizationId });
}

export async function fetchEntitlementsSummary(
  organizationId: string,
): Promise<OrganizationEntitlements> {
  return apiFetch<OrganizationEntitlements>('/billing/entitlements', { organizationId });
}

export async function fetchSubscription(
  organizationId: string,
): Promise<SubscriptionSummary | null> {
  return apiFetch<SubscriptionSummary | null>('/billing/subscription', { organizationId });
}

export async function fetchInvoices(
  organizationId: string,
  page = 1,
): Promise<Paginated<InvoiceSummary>> {
  return apiFetch<Paginated<InvoiceSummary>>(`/billing/invoices?page=${page}`, {
    organizationId,
  });
}

export async function fetchInvoice(
  organizationId: string,
  invoiceId: string,
): Promise<InvoiceDetail> {
  return apiFetch<InvoiceDetail>(`/billing/invoices/${invoiceId}`, { organizationId });
}

export async function fetchTickets(organizationId: string): Promise<TicketSummary[]> {
  return apiFetch<TicketSummary[]>('/support/tickets', { organizationId });
}

export async function fetchTicket(
  organizationId: string,
  ticketId: string,
): Promise<TicketDetail> {
  return apiFetch<TicketDetail>(`/support/tickets/${ticketId}`, { organizationId });
}

/**
 * يحوّل البيسة إلى نص ريال للعرض.
 *
 * **للعرض وحده.** لا يعود هذا الرقم إلى أي حساب: كل الحسابات تجري
 * على أعداد صحيحة بالبيسة في الخادم، وتحويله هنا هو آخر خطوة قبل
 * الطباعة.
 */
export function formatOmr(baisa: number, locale: string): string {
  const value = baisa / 1000;
  return new Intl.NumberFormat(locale === 'en' ? 'en-OM' : 'ar-OM', {
    style: 'currency',
    currency: 'OMR',
    minimumFractionDigits: 3,
  }).format(value);
}

/** الحد ‎-1 يعني بلا حد — تُعرض كرمز لا كرقم سالب. */
export function formatLimit(limit: number, unlimitedLabel: string): string {
  return limit < 0 ? unlimitedLabel : String(limit);
}
