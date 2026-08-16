'use server';

import { reviewChangeRequestSchema, updateCardSchema } from '@nomiqa/validation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { activeOrganizationId } from '../../../lib/cards';

/**
 * إجراءات سير الموافقة (§9.3).
 */

export interface ApprovalActionResult {
  ok: boolean;
  message?: string;
}

const LIST_PATH = '/[locale]/approvals';
const DETAIL_PATH = '/[locale]/approvals/[id]';

/**
 * تقديم طلب تعديل.
 *
 * يُستدعى من محرر البطاقة حين يرفض الـAPI التعديل برمز
 * `CARD_FIELD_LOCKED`: الموظف يملك حق التعديل، والسياسة قيّدته ولم
 * تلغه، فالمخرج طلب لا رسالة رفض.
 */
export async function submitChangeRequestAction(
  cardId: string,
  input: unknown,
): Promise<ApprovalActionResult> {
  const parsed = updateCardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    await apiFetch(`/change-requests/cards/${cardId}`, {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(LIST_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function reviewChangeRequestAction(
  requestId: string,
  input: unknown,
): Promise<ApprovalActionResult> {
  const parsed = reviewChangeRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  // الرفض بلا سبب يجعل الموظف يعيد إرسال الطلب نفسه فتدور الحلقة.
  if (parsed.data.decision === 'reject' && !parsed.data.note?.trim()) {
    return { ok: false, message: 'اذكر سبب الرفض' };
  }

  try {
    const organizationId = await activeOrganizationId();
    await apiFetch(`/change-requests/${requestId}/review`, {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(LIST_PATH, 'page');
    revalidatePath(DETAIL_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function withdrawChangeRequestAction(
  requestId: string,
): Promise<ApprovalActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await apiFetch(`/change-requests/${requestId}/withdraw`, {
      method: 'POST',
      organizationId,
    });

    revalidatePath(LIST_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

function describe(error: unknown): string {
  return error instanceof ApiError ? error.message : 'تعذّر تنفيذ العملية';
}
