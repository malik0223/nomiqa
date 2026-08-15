'use server';

import type { ContactDetail, ContactNoteData, TagData } from '@nomiqa/contracts';
import {
  contactNoteSchema,
  contactUpdateSchema,
  followUpTaskSchema,
  tagSchema,
  type ContactUpdateInput,
} from '@nomiqa/validation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { activeOrganizationId } from '../../../lib/cards';

export interface ContactActionResult {
  ok: boolean;
  message?: string;
}

const LIST_PATH = '/[locale]/contacts';
const DETAIL_PATH = '/[locale]/contacts/[id]';

/**
 * إجراءات جهات الاتصال.
 *
 * تتبع نفس نمط إجراءات البطاقات: التحقق بنفس مخطط الـAPI هنا للتجربة،
 * والـAPI يعيد التحقق دائماً — المتصفح ليس حدود الثقة (§4.6).
 */

export async function updateContactAction(
  contactId: string,
  input: ContactUpdateInput,
): Promise<ContactActionResult & { contact?: ContactDetail }> {
  const parsed = contactUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const contact = await apiFetch<ContactDetail>(`/contacts/${contactId}`, {
      method: 'PATCH',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(LIST_PATH, 'page');
    revalidatePath(DETAIL_PATH, 'page');

    return { ok: true, contact };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function deleteContactAction(contactId: string): Promise<ContactActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await apiFetch(`/contacts/${contactId}`, { method: 'DELETE', organizationId });

    revalidatePath(LIST_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function addNoteAction(
  contactId: string,
  body: string,
): Promise<ContactActionResult & { note?: ContactNoteData }> {
  const parsed = contactNoteSchema.safeParse({ body });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const note = await apiFetch<ContactNoteData>(`/contacts/${contactId}/notes`, {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(DETAIL_PATH, 'page');
    return { ok: true, note };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function removeNoteAction(
  contactId: string,
  noteId: string,
): Promise<ContactActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await apiFetch(`/contacts/${contactId}/notes/${noteId}`, {
      method: 'DELETE',
      organizationId,
    });

    revalidatePath(DETAIL_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function addFollowUpAction(
  contactId: string,
  title: string,
  dueAt: string,
): Promise<ContactActionResult> {
  const parsed = followUpTaskSchema.safeParse({ title, dueAt });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    await apiFetch(`/contacts/${contactId}/follow-ups`, {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(DETAIL_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function completeFollowUpAction(
  contactId: string,
  taskId: string,
): Promise<ContactActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await apiFetch(`/contacts/${contactId}/follow-ups/${taskId}`, {
      method: 'PATCH',
      body: { status: 'done' },
      organizationId,
    });

    revalidatePath(DETAIL_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function createTagAction(
  name: string,
): Promise<ContactActionResult & { tag?: TagData }> {
  const parsed = tagSchema.safeParse({ name });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const tag = await apiFetch<TagData>('/tags', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(LIST_PATH, 'page');
    revalidatePath(DETAIL_PATH, 'page');
    return { ok: true, tag };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

function describe(error: unknown): string | undefined {
  return error instanceof ApiError ? error.message : undefined;
}
