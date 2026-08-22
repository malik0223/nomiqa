'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '@/lib/api-client';

/**
 * أفعال لوحة الإدارة.
 *
 * كلها خادمية ولا تمرّر `organizationId`: المسارات موسومة
 * بـ`@NoTenantRequired`، والصلاحية يفرضها `PlatformAdminGuard` في كل
 * طلب من قاعدة البيانات. لا فحص صلاحية هنا — فحصٌ في الواجهة يوهم
 * بحماية يملك المتصفح تعطيلها.
 */

export interface AdminActionResult {
  ok: boolean;
  message?: string;
}

function fail(error: unknown): AdminActionResult {
  if (error instanceof ApiError) {
    return { ok: false, message: error.message };
  }
  return { ok: false, message: 'تعذّر إتمام العملية' };
}

export async function suspendOrganizationAction(
  organizationId: string,
  reason: string,
  blockPublicAccess: boolean,
): Promise<AdminActionResult> {
  try {
    await apiFetch(`/admin/organizations/${organizationId}/suspend`, {
      method: 'POST',
      body: { reason, blockPublicAccess },
    });
    revalidatePath('/[locale]/admin/organizations', 'page');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function unsuspendOrganizationAction(
  organizationId: string,
): Promise<AdminActionResult> {
  try {
    await apiFetch(`/admin/organizations/${organizationId}/unsuspend`, { method: 'POST' });
    revalidatePath('/[locale]/admin/organizations', 'page');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function updateFeatureFlagAction(
  key: string,
  input: { enabled?: boolean; rolloutPercentage?: number },
): Promise<AdminActionResult> {
  try {
    await apiFetch(`/admin/feature-flags/${key}`, { method: 'PATCH', body: input });
    revalidatePath('/[locale]/admin/flags', 'page');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/**
 * سعر باقة لدورة فوترة.
 *
 * المبلغ بالبيسة صحيحاً: الفاصلة العائمة في المال تُنتج فروقاً لا
 * تُلاحَظ إلا في التقارير الشهرية. الواجهة تعرض ريالات وتحوّل هنا.
 */
export async function upsertPlanPriceAction(
  planKey: string,
  interval: 'month' | 'year',
  amountBaisa: number,
): Promise<AdminActionResult> {
  try {
    await apiFetch(`/admin/plans/${planKey}/prices`, {
      method: 'PUT',
      body: { interval, currency: 'OMR', amountBaisa, isActive: true },
    });
    revalidatePath('/[locale]/admin/plans', 'page');
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
