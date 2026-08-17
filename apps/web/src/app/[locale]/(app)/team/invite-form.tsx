'use client';

import type { BranchSummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { inviteMemberAction } from './actions';

const CONTROL =
  'rounded-lg border border-line bg-white px-3 py-2 text-sm';

interface Labels {
  email: string;
  role: string;
  roleAdmin: string;
  roleMember: string;
  department: string;
  branch: string;
  jobTitle: string;
  none: string;
  submit: string;
  sending: string;
  copyLink: string;
  copied: string;
  linkOnce: string;
}

/**
 * نموذج دعوة موظف.
 *
 * رابط الدعوة يُعرض بعد النجاح **مرة واحدة**: الرمز مجزّأ في قاعدة
 * البيانات، ولا مسار يستعيده. النص الصريح تحت الرابط يقول ذلك بدل أن
 * يكتشفه المسؤول حين يبحث عنه غداً ولا يجده.
 */
export function InviteForm({
  departments,
  branches,
  disabled,
  labels,
}: {
  departments: Array<{ id: string; name: string; depth: number }>;
  branches: BranchSummary[];
  disabled: boolean;
  labels: Labels;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function submit(formData: FormData): void {
    setError(null);
    setInviteUrl(null);
    setCopied(false);

    startTransition(async () => {
      const result = await inviteMemberAction({
        email: String(formData.get('email') ?? ''),
        role: String(formData.get('role') ?? 'member'),
        departmentId: emptyToNull(formData.get('departmentId')),
        branchId: emptyToNull(formData.get('branchId')),
        jobTitle: emptyToNull(formData.get('jobTitle')),
        locale: 'ar',
      });

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      setInviteUrl(result.inviteUrl ?? null);
    });
  }

  return (
    <div className="mt-4">
      <form action={submit} className="flex flex-wrap items-end gap-2">
        <input
          type="email"
          name="email"
          required
          placeholder={labels.email}
          aria-label={labels.email}
          disabled={disabled}
          className={`${CONTROL} min-w-56 flex-1`}
        />

        <select name="role" aria-label={labels.role} disabled={disabled} className={CONTROL}>
          <option value="member">{labels.roleMember}</option>
          <option value="admin">{labels.roleAdmin}</option>
        </select>

        <select
          name="departmentId"
          aria-label={labels.department}
          disabled={disabled}
          className={CONTROL}
        >
          <option value="">{labels.department}</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {' '.repeat(department.depth * 2)}
              {department.name}
            </option>
          ))}
        </select>

        <select name="branchId" aria-label={labels.branch} disabled={disabled} className={CONTROL}>
          <option value="">{labels.branch}</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          name="jobTitle"
          placeholder={labels.jobTitle}
          aria-label={labels.jobTitle}
          disabled={disabled}
          className={`${CONTROL} min-w-40`}
        />

        <button
          type="submit"
          disabled={pending || disabled}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? labels.sending : labels.submit}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger-500">
          {error}
        </p>
      ) : null}

      {inviteUrl ? (
        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">
              {inviteUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl).then(() => setCopied(true));
              }}
              className="rounded-lg border border-line px-3 py-1.5 text-xs"
            >
              {copied ? labels.copied : labels.copyLink}
            </button>
          </div>
          <p className="mt-2 text-xs text-faint">{labels.linkOnce}</p>
        </div>
      ) : null}
    </div>
  );
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}
