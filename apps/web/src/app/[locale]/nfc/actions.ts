'use server';

import { nfcTagAssignSchema, nfcTagCreateSchema, nfcTagRevokeSchema } from '@nomiqa/validation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { activeOrganizationId } from '../../../lib/cards';

/** إجراءات وسوم NFC (§10.2). */

export interface NfcActionResult {
  ok: boolean;
  message?: string;
}

const NFC_PATH = '/[locale]/nfc';

export async function issueTagAction(input: unknown): Promise<NfcActionResult> {
  const parsed = nfcTagCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch('/nfc/tags', { method: 'POST', body: parsed.data, organizationId });
  });
}

export async function assignTagAction(id: string, input: unknown): Promise<NfcActionResult> {
  const parsed = nfcTagAssignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch(`/nfc/tags/${id}/assignment`, {
      method: 'PUT',
      body: parsed.data,
      organizationId,
    });
  });
}

/**
 * إبطال وسم مفقود.
 *
 * لا تأكيد في الإجراء بل في الواجهة قبل استدعائه: الإبطال لا رجعة فيه،
 * ومربع تأكيد بعد إرسال الطلب لا يعني شيئاً.
 */
export async function revokeTagAction(id: string, input: unknown): Promise<NfcActionResult> {
  const parsed = nfcTagRevokeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch(`/nfc/tags/${id}/revocation`, {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });
  });
}

async function run(work: (organizationId: string) => Promise<void>): Promise<NfcActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await work(organizationId);

    revalidatePath(NFC_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof ApiError ? error.message : 'تعذّر تنفيذ العملية' };
  }
}
