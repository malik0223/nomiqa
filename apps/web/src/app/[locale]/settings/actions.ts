'use server';

import { revalidatePath } from 'next/cache';
import type { UserDataExport, UserProfile } from '@nomiqa/contracts';
import { consentUpdateSchema, profileUpdateSchema } from '@nomiqa/validation';
import { ApiError, apiFetch } from '../../../lib/api-client';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/**
 * إجراءات الخادم بدل مسارات API في الويب.
 *
 * الفائدة الأمنية: الـAccess Token لا يغادر الخادم إطلاقاً. المكوّن
 * العميل يستدعي دالة، والاستدعاء الفعلي للـAPI يتم هنا.
 */

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const raw = {
    fullName: (formData.get('fullName') as string | null)?.trim() || null,
    locale: (formData.get('locale') as string) || undefined,
    timeZone: (formData.get('timeZone') as string)?.trim() || undefined,
  };

  // نفس المخطط المستخدم في الـAPI — قاعدة واحدة لا اثنتان.
  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    await apiFetch<UserProfile>('/me/profile', { method: 'PATCH', body: parsed.data });
    revalidatePath('/[locale]/settings', 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function updateConsentAction(
  purpose: string,
  granted: boolean,
): Promise<ActionResult> {
  const parsed = consentUpdateSchema.safeParse({ purpose, granted });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    await apiFetch('/me/consents', { method: 'POST', body: parsed.data });
    revalidatePath('/[locale]/settings', 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function exportDataAction(): Promise<
  { ok: true; data: UserDataExport } | { ok: false; message?: string }
> {
  try {
    const data = await apiFetch<UserDataExport>('/me/export');
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function requestDeletionAction(): Promise<ActionResult> {
  try {
    await apiFetch('/me/account/deletion', { method: 'POST' });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

function describe(error: unknown): string | undefined {
  return error instanceof ApiError ? error.message : undefined;
}
