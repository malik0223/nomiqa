'use server';

import { invitationTokenSchema } from '@nomiqa/validation';
import { ApiError, apiFetch } from '@/lib/api-client';

/**
 * قبول الدعوة.
 *
 * **بلا ترويسة مؤسسة**: المدعو ليس عضواً في أي مؤسسة بعد، والمسار
 * معلَّم بـ`@NoTenantRequired` في الـAPI. تمرير مؤسسة هنا كان سيفشل
 * الطلب على من لا يملك واحدة.
 */
export async function acceptInvitationAction(
  token: string,
): Promise<{ ok: boolean; message?: string }> {
  const parsed = invitationTokenSchema.safeParse(token);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    await apiFetch(`/invitations/token/${parsed.data}/accept`, { method: 'POST' });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApiError ? error.message : 'تعذّر قبول الدعوة',
    };
  }
}
