'use client';

import type { BranchSummary, MemberSummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import {
  offboardMemberAction,
  reinstateMemberAction,
  updateMemberAction,
} from './actions';

const CONTROL =
  'rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950';

interface Labels {
  name: string;
  email: string;
  role: string;
  department: string;
  branch: string;
  cards: string;
  status: string;
  actions: string;
  edit: string;
  save: string;
  cancel: string;
  offboard: string;
  offboardConfirm: string;
  unpublishCards: string;
  transferTo: string;
  reinstate: string;
  none: string;
  empty: string;
  revoked: string;
  active: string;
}

/**
 * جدول الأعضاء.
 *
 * التحرير في مكانه لا في صفحة منفصلة: تصحيح إدارة موظف عملية من
 * ثانيتين، والانتقال إلى صفحة وحفظها والعودة يجعل تصحيح عشرة موظفين
 * بعد إعادة هيكلة عملاً شاقاً.
 *
 * إنهاء الخدمة **يُطلب تأكيداً** ويعرض خياراته صراحةً: إلغاء نشر
 * البطاقات ونقل الملكية أثران لا يمكن التراجع عنهما بضغطة، وإخفاؤهما
 * خلف زر واحد كان سيجعل المسؤول يكتشفهما بعد وقوعهما.
 */
export function MembersTable({
  members,
  departments,
  branches,
  meta,
  labels,
}: {
  members: MemberSummary[];
  departments: Array<{ id: string; name: string; depth: number }>;
  branches: BranchSummary[];
  meta: { page: number; totalPages: number; total: number };
  labels: Labels;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [offboarding, setOffboarding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (members.length === 0) {
    return <p className="mt-4 text-sm text-neutral-500">{labels.empty}</p>;
  }

  function save(membershipId: string, formData: FormData): void {
    setError(null);

    startTransition(async () => {
      const result = await updateMemberAction(membershipId, {
        role: String(formData.get('role') ?? 'member'),
        departmentId: emptyToNull(formData.get('departmentId')),
        branchId: emptyToNull(formData.get('branchId')),
        jobTitle: emptyToNull(formData.get('jobTitle')),
      });

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      setEditing(null);
    });
  }

  function offboard(membershipId: string, formData: FormData): void {
    setError(null);

    startTransition(async () => {
      const result = await offboardMemberAction(membershipId, {
        unpublishCards: formData.get('unpublishCards') === 'on',
        transferToUserId: emptyToNull(formData.get('transferToUserId')),
      });

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      setOffboarding(null);
    });
  }

  return (
    <div className="mt-4">
      {error ? (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-start dark:bg-neutral-900">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{labels.name}</th>
              <th className="px-4 py-3 text-start font-medium">{labels.role}</th>
              <th className="px-4 py-3 text-start font-medium">{labels.department}</th>
              <th className="px-4 py-3 text-start font-medium">{labels.branch}</th>
              <th className="px-4 py-3 text-start font-medium">{labels.cards}</th>
              <th className="px-4 py-3 text-start font-medium">{labels.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {members.map((member) => {
              const isEditing = editing === member.membershipId;
              const isOffboarding = offboarding === member.membershipId;
              const isRevoked = member.status === 'revoked';

              if (isEditing) {
                return (
                  <tr key={member.membershipId}>
                    <td colSpan={6} className="px-4 py-3">
                      <form
                        action={(formData) => save(member.membershipId, formData)}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <span className="min-w-40 text-sm font-medium">
                          {member.fullName ?? member.email}
                        </span>

                        <select
                          name="role"
                          defaultValue={member.roles.includes('admin') ? 'admin' : 'member'}
                          aria-label={labels.role}
                          className={CONTROL}
                        >
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>

                        <select
                          name="departmentId"
                          defaultValue={member.departmentId ?? ''}
                          aria-label={labels.department}
                          className={CONTROL}
                        >
                          <option value="">{labels.none}</option>
                          {departments.map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name}
                            </option>
                          ))}
                        </select>

                        <select
                          name="branchId"
                          defaultValue={member.branchId ?? ''}
                          aria-label={labels.branch}
                          className={CONTROL}
                        >
                          <option value="">{labels.none}</option>
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          name="jobTitle"
                          defaultValue={member.jobTitle ?? ''}
                          aria-label={labels.name}
                          className={`${CONTROL} min-w-40`}
                        />

                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {labels.save}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="px-2 py-1.5 text-xs text-neutral-500"
                        >
                          {labels.cancel}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              }

              if (isOffboarding) {
                return (
                  <tr key={member.membershipId}>
                    <td colSpan={6} className="bg-amber-50 px-4 py-4 dark:bg-amber-950/40">
                      <form
                        action={(formData) => offboard(member.membershipId, formData)}
                        className="space-y-3"
                      >
                        <p className="text-sm">
                          {labels.offboardConfirm} — {member.fullName ?? member.email}
                        </p>

                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="unpublishCards"
                            defaultChecked
                            className="h-4 w-4"
                          />
                          {labels.unpublishCards}
                        </label>

                        <label className="flex flex-wrap items-center gap-2 text-sm">
                          {labels.transferTo}
                          <select name="transferToUserId" className={CONTROL}>
                            <option value="">{labels.none}</option>
                            {members
                              .filter(
                                (candidate) =>
                                  candidate.userId !== member.userId &&
                                  candidate.status !== 'revoked',
                              )
                              .map((candidate) => (
                                <option key={candidate.userId} value={candidate.userId}>
                                  {candidate.fullName ?? candidate.email}
                                </option>
                              ))}
                          </select>
                        </label>

                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={pending}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                          >
                            {labels.offboard}
                          </button>
                          <button
                            type="button"
                            onClick={() => setOffboarding(null)}
                            className="px-2 py-1.5 text-xs text-neutral-500"
                          >
                            {labels.cancel}
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={member.membershipId} className={isRevoked ? 'opacity-60' : undefined}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{member.fullName ?? '—'}</div>
                    <div className="text-xs text-neutral-500">{member.email}</div>
                    {member.scopes.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {member.scopes.map((scope) => (
                          <span
                            key={scope.id}
                            className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                          >
                            {scope.roleName}: {scope.scopeName}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{member.roles.join('، ')}</td>
                  <td className="px-4 py-3">{member.departmentName ?? '—'}</td>
                  <td className="px-4 py-3">{member.branchName ?? '—'}</td>
                  <td className="px-4 py-3">{member.cardCount}</td>
                  <td className="px-4 py-3">
                    {isRevoked ? (
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(async () => {
                            const result = await reinstateMemberAction(member.membershipId);
                            if (!result.ok) setError(result.message ?? null);
                          })
                        }
                        disabled={pending}
                        className="text-xs text-brand-600 hover:underline disabled:opacity-50"
                      >
                        {labels.reinstate}
                      </button>
                    ) : (
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setEditing(member.membershipId)}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          {labels.edit}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOffboarding(member.membershipId)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          {labels.offboard}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {meta.totalPages > 1 ? (
        <nav className="mt-4 flex gap-2 text-sm">
          {meta.page > 1 ? (
            <a href={`?page=${meta.page - 1}`} className="text-brand-600 hover:underline">
              ‹
            </a>
          ) : null}
          <span className="text-neutral-500">
            {meta.page} / {meta.totalPages}
          </span>
          {meta.page < meta.totalPages ? (
            <a href={`?page=${meta.page + 1}`} className="text-brand-600 hover:underline">
              ›
            </a>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}
