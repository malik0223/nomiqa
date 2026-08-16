import 'server-only';
import type {
  BranchSummary,
  BrandKitPayload,
  BrandPolicySummary,
  ChangeRequestDetail,
  ChangeRequestSummary,
  CustomDomainSummary,
  DepartmentNode,
  DirectoryEntry,
  EmployeeImportSummary,
  InvitationSummary,
  MemberSummary,
  Paginated,
} from '@nomiqa/contracts';
import { apiFetch } from './api-client';

/**
 * قراءات الفريق والهوية المؤسسية (المرحلة 4).
 *
 * كلها خادمية: قائمة الموظفين وبريدهم بيانات مؤسسة، ودليلها لا يجوز
 * أن يُقرأ برمز وصول يصل إلى المتصفح.
 */

export async function fetchDepartments(organizationId: string): Promise<DepartmentNode[]> {
  return apiFetch<DepartmentNode[]>('/teams/departments', { organizationId });
}

export async function fetchBranches(organizationId: string): Promise<BranchSummary[]> {
  return apiFetch<BranchSummary[]>('/teams/branches', { organizationId });
}

export async function fetchMembers(
  organizationId: string,
  query: Record<string, string | number | undefined>,
): Promise<Paginated<MemberSummary>> {
  return apiFetch<Paginated<MemberSummary>>(`/teams/members${toQueryString(query)}`, {
    organizationId,
  });
}

export async function fetchInvitations(organizationId: string): Promise<InvitationSummary[]> {
  return apiFetch<InvitationSummary[]>('/invitations', { organizationId });
}

export async function fetchImports(organizationId: string): Promise<EmployeeImportSummary[]> {
  return apiFetch<EmployeeImportSummary[]>('/teams/imports', { organizationId });
}

export async function fetchDirectory(
  organizationId: string,
  query: Record<string, string | number | undefined>,
): Promise<Paginated<DirectoryEntry>> {
  return apiFetch<Paginated<DirectoryEntry>>(`/directory${toQueryString(query)}`, {
    organizationId,
  });
}

export async function fetchBrandKit(organizationId: string): Promise<BrandKitPayload> {
  return apiFetch<BrandKitPayload>('/branding/kit', { organizationId });
}

export async function fetchBrandPolicies(organizationId: string): Promise<BrandPolicySummary[]> {
  return apiFetch<BrandPolicySummary[]>('/branding/policies', { organizationId });
}

export async function fetchDomains(organizationId: string): Promise<CustomDomainSummary[]> {
  return apiFetch<CustomDomainSummary[]>('/branding/domains', { organizationId });
}

export async function fetchChangeRequests(
  organizationId: string,
  status: string,
): Promise<Paginated<ChangeRequestSummary>> {
  return apiFetch<Paginated<ChangeRequestSummary>>(`/change-requests?status=${status}`, {
    organizationId,
  });
}

export async function fetchChangeRequest(
  organizationId: string,
  requestId: string,
): Promise<ChangeRequestDetail> {
  return apiFetch<ChangeRequestDetail>(`/change-requests/${requestId}`, { organizationId });
}

export async function fetchMyChangeRequests(
  organizationId: string,
): Promise<ChangeRequestSummary[]> {
  return apiFetch<ChangeRequestSummary[]>('/change-requests/mine', { organizationId });
}

function toQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}
