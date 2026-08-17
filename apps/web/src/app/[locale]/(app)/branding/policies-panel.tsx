'use client';

import type { BranchSummary, BrandPolicySummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { createPolicyAction, deletePolicyAction } from './actions';

const CONTROL =
  'rounded-lg border border-line bg-white px-3 py-2 text-sm';

interface Labels {
  name: string;
  scope: string;
  organization: string;
  department: string;
  branch: string;
  lockedFields: string;
  requireApproval: string;
  add: string;
  delete: string;
  deleteConfirm: string;
  empty: string;
  planLimit: string;
  fieldLabels: Record<string, string>;
}

/**
 * سياسات البطاقات.
 *
 * النطاق قائمة واحدة لا حقلان: السياسة تخص إدارة **أو** فرعاً لا
 * الاثنين (يرفضها الـAPI)، وحقلان منفصلان كانا سيسمحان للمسؤول ببناء
 * صفٍّ مرفوض ثم اكتشاف ذلك عند الحفظ.
 */
export function PoliciesPanel({
  policies,
  departments,
  branches,
  lockableFields,
  canLockFields,
  canRequireApproval,
  labels,
}: {
  policies: BrandPolicySummary[];
  departments: Array<{ id: string; name: string }>;
  branches: BranchSummary[];
  lockableFields: string[];
  canLockFields: boolean;
  canRequireApproval: boolean;
  labels: Labels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canLockFields && !canRequireApproval) {
    return <p className="mt-4 text-sm text-faint">{labels.planLimit}</p>;
  }

  function add(formData: FormData): void {
    setError(null);

    const scope = String(formData.get('scope') ?? '');
    const [kind, id] = scope.split(':');

    startTransition(async () => {
      const result = await createPolicyAction({
        name: String(formData.get('name') ?? ''),
        departmentId: kind === 'department' ? id : null,
        branchId: kind === 'branch' ? id : null,
        lockedFields: formData.getAll('lockedFields').map(String),
        requireApproval: formData.get('requireApproval') === 'on',
        isActive: true,
      });

      if (!result.ok) setError(result.message ?? null);
    });
  }

  function remove(id: string): void {
    if (!globalThis.confirm(labels.deleteConfirm)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await deletePolicyAction(id);
      if (!result.ok) setError(result.message ?? null);
    });
  }

  return (
    <div className="mt-4">
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger-500">
          {error}
        </p>
      ) : null}

      {policies.length === 0 ? (
        <p className="text-sm text-faint">{labels.empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface shadow-sheet">
          {policies.map((policy) => (
            <li key={policy.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex-1 font-medium">{policy.name}</span>
                <span className="text-xs text-faint">
                  {policy.departmentName ?? policy.branchName ?? labels.organization}
                </span>
                <button
                  type="button"
                  onClick={() => remove(policy.id)}
                  disabled={pending}
                  className="text-xs text-danger-500 hover:underline disabled:opacity-50"
                >
                  {labels.delete}
                </button>
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                {policy.lockedFields.map((field) => (
                  <span
                    key={field}
                    className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px]"
                  >
                    {labels.fieldLabels[field] ?? field}
                  </span>
                ))}
                {policy.requireApproval ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                    {labels.requireApproval}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={add} className="mt-4 space-y-3 rounded-card border border-line p-4">
        <div className="flex flex-wrap gap-2">
          <input
            name="name"
            required
            placeholder={labels.name}
            aria-label={labels.name}
            className={`${CONTROL} min-w-48 flex-1`}
          />

          <select name="scope" aria-label={labels.scope} className={CONTROL}>
            <option value="">{labels.organization}</option>
            {departments.map((department) => (
              <option key={department.id} value={`department:${department.id}`}>
                {labels.department}: {department.name}
              </option>
            ))}
            {branches.map((branch) => (
              <option key={branch.id} value={`branch:${branch.id}`}>
                {labels.branch}: {branch.name}
              </option>
            ))}
          </select>
        </div>

        {canLockFields ? (
          <fieldset>
            <legend className="text-sm font-medium">{labels.lockedFields}</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {lockableFields.map((field) => (
                <label key={field} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" name="lockedFields" value={field} className="h-3.5 w-3.5" />
                  {labels.fieldLabels[field] ?? field}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {canRequireApproval ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requireApproval" className="h-4 w-4" />
            {labels.requireApproval}
          </label>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {labels.add}
        </button>
      </form>
    </div>
  );
}
