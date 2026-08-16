'use server';

import {
  createBranchSchema,
  createDepartmentSchema,
  employeeImportOptionsSchema,
  grantScopeSchema,
  inviteMemberSchema,
  offboardMemberSchema,
  updateMemberSchema,
} from '@nomiqa/validation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { activeOrganizationId } from '../../../lib/cards';

/**
 * إجراءات إدارة الفريق (§9.2).
 *
 * التحقق هنا للتجربة، والـAPI يعيد التحقق دائماً — المتصفح ليس حدود
 * الثقة (§4.6). ما يميّز هذه الإجراءات عن غيرها أن أثرها يمس **حساب
 * شخص آخر**، فكل واحد منها يعيد رسالة الخطأ كما جاءت من الـAPI بدل
 * رسالة عامة: «الرقم الوظيفي مستخدم» قابلة للتصحيح، و«فشل الطلب» لا.
 */

export interface TeamActionResult {
  ok: boolean;
  message?: string;
}

const TEAM_PATH = '/[locale]/team';
const DIRECTORY_PATH = '/[locale]/directory';

export async function createDepartmentAction(input: unknown): Promise<TeamActionResult> {
  const parsed = createDepartmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch('/teams/departments', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });
  });
}

export async function deleteDepartmentAction(id: string): Promise<TeamActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/teams/departments/${id}`, { method: 'DELETE', organizationId });
  });
}

export async function createBranchAction(input: unknown): Promise<TeamActionResult> {
  const parsed = createBranchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch('/teams/branches', { method: 'POST', body: parsed.data, organizationId });
  });
}

export async function deleteBranchAction(id: string): Promise<TeamActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/teams/branches/${id}`, { method: 'DELETE', organizationId });
  });
}

/**
 * دعوة موظف.
 *
 * يعيد رابط الدعوة: البريد هو المسار المعتاد، لكن المسؤول قد يحتاج
 * نسخ الرابط ليرسله بقناة أخرى. **يظهر مرة واحدة** — الرمز مجزّأ في
 * قاعدة البيانات ولا يمكن استرجاعه بعد إغلاق الشاشة.
 */
export async function inviteMemberAction(
  input: unknown,
): Promise<TeamActionResult & { inviteUrl?: string }> {
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const result = await apiFetch<{ token: string }>('/invitations', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(TEAM_PATH, 'page');

    const base = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
    return { ok: true, inviteUrl: `${base}/invitations/${result.token}` };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function revokeInvitationAction(id: string): Promise<TeamActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/invitations/${id}`, { method: 'DELETE', organizationId });
  });
}

export async function updateMemberAction(
  membershipId: string,
  input: unknown,
): Promise<TeamActionResult> {
  const parsed = updateMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch(`/teams/members/${membershipId}`, {
      method: 'PATCH',
      body: parsed.data,
      organizationId,
    });
  });
}

export async function offboardMemberAction(
  membershipId: string,
  input: unknown,
): Promise<TeamActionResult> {
  const parsed = offboardMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch(`/teams/members/${membershipId}/offboard`, {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });
  });
}

export async function reinstateMemberAction(membershipId: string): Promise<TeamActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/teams/members/${membershipId}/reinstate`, {
      method: 'POST',
      organizationId,
    });
  });
}

export async function grantScopeAction(
  membershipId: string,
  input: unknown,
): Promise<TeamActionResult> {
  const parsed = grantScopeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch(`/teams/members/${membershipId}/scopes`, {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });
  });
}

export async function revokeScopeAction(
  membershipId: string,
  scopeId: string,
): Promise<TeamActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/teams/members/${membershipId}/scopes/${scopeId}`, {
      method: 'DELETE',
      organizationId,
    });
  });
}

/**
 * بدء دفعة استيراد.
 *
 * محتوى الملف يُقرأ في المتصفح ويُرسل نصاً: الملف **لا يُخزَّن** لا
 * عندنا ولا في مسار الرفع. بيانات موارد بشرية كاملة لا داعي لبقاء
 * نسخة منها بعد تنفيذ الدفعة.
 */
export async function startImportAction(
  options: unknown,
  content: string,
): Promise<TeamActionResult & { importId?: string }> {
  const parsed = employeeImportOptionsSchema.safeParse(options);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const result = await apiFetch<{ id: string }>('/teams/imports', {
      method: 'POST',
      body: { options: parsed.data, content },
      organizationId,
    });

    revalidatePath(TEAM_PATH, 'page');
    return { ok: true, importId: result.id };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

async function run(work: (organizationId: string) => Promise<void>): Promise<TeamActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await work(organizationId);

    revalidatePath(TEAM_PATH, 'page');
    revalidatePath(DIRECTORY_PATH, 'page');

    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

function describe(error: unknown): string {
  return error instanceof ApiError ? error.message : 'تعذّر تنفيذ العملية';
}
