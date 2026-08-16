'use server';

import { campaignSchema } from '@nomiqa/validation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { activeOrganizationId } from '../../../lib/cards';

/** إجراءات الحملات (§10.4). */

export interface CampaignActionResult {
  ok: boolean;
  message?: string;
}

const CAMPAIGNS_PATH = '/[locale]/campaigns';

export async function createCampaignAction(input: unknown): Promise<CampaignActionResult> {
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch('/campaigns', { method: 'POST', body: parsed.data, organizationId });
  });
}

export async function updateCampaignAction(
  id: string,
  input: unknown,
): Promise<CampaignActionResult> {
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch(`/campaigns/${id}`, { method: 'PUT', body: parsed.data, organizationId });
  });
}

export async function deleteCampaignAction(id: string): Promise<CampaignActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/campaigns/${id}`, { method: 'DELETE', organizationId });
  });
}

async function run(
  work: (organizationId: string) => Promise<void>,
): Promise<CampaignActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await work(organizationId);

    revalidatePath(CAMPAIGNS_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof ApiError ? error.message : 'تعذّر تنفيذ العملية' };
  }
}
