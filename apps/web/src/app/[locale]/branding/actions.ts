'use server';

import { brandKitSchema, brandPolicySchema, customDomainSchema } from '@nomiqa/validation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { activeOrganizationId } from '../../../lib/cards';

/** إجراءات الهوية المؤسسية (§9.3). */

export interface BrandingActionResult {
  ok: boolean;
  message?: string;
}

const BRANDING_PATH = '/[locale]/branding';

export async function updateBrandKitAction(input: unknown): Promise<BrandingActionResult> {
  const parsed = brandKitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch('/branding/kit', { method: 'PUT', body: parsed.data, organizationId });
  });
}

export async function createPolicyAction(input: unknown): Promise<BrandingActionResult> {
  const parsed = brandPolicySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch('/branding/policies', { method: 'POST', body: parsed.data, organizationId });
  });
}

export async function deletePolicyAction(id: string): Promise<BrandingActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/branding/policies/${id}`, { method: 'DELETE', organizationId });
  });
}

export async function addDomainAction(input: unknown): Promise<BrandingActionResult> {
  const parsed = customDomainSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch('/branding/domains', { method: 'POST', body: parsed.data, organizationId });
  });
}

export async function removeDomainAction(id: string): Promise<BrandingActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/branding/domains/${id}`, { method: 'DELETE', organizationId });
  });
}

async function run(
  work: (organizationId: string) => Promise<void>,
): Promise<BrandingActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await work(organizationId);

    revalidatePath(BRANDING_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof ApiError ? error.message : 'تعذّر تنفيذ العملية' };
  }
}
