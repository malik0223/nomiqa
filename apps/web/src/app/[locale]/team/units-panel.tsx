'use client';

import type { BranchSummary, DepartmentNode } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import {
  createBranchAction,
  createDepartmentAction,
  deleteBranchAction,
  deleteDepartmentAction,
} from './actions';

const CONTROL =
  'rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950';

interface Labels {
  departments: string;
  branches: string;
  name: string;
  code: string;
  parent: string;
  city: string;
  add: string;
  delete: string;
  deleteConfirm: string;
  none: string;
  members: string;
  planLimit: string;
  empty: string;
}

/**
 * الإدارات والفروع.
 *
 * الحذف يؤكَّد بحوار المتصفح لا بنافذة مخصصة: العملية غير مدمّرة —
 * الموظفون يبقون بلا إدارة لا بلا عضوية — فتأكيد بسيط يكفي، وبناء
 * حوار مخصص لكل زر حذف يضخّم الشاشة بلا مقابل.
 */
export function UnitsPanel({
  departments,
  branches,
  canAddDepartment,
  canAddBranch,
  labels,
}: {
  departments: DepartmentNode[];
  branches: BranchSummary[];
  canAddDepartment: boolean;
  canAddBranch: boolean;
  labels: Labels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const flat = flatten(departments);

  function addDepartment(formData: FormData): void {
    setError(null);
    startTransition(async () => {
      const result = await createDepartmentAction({
        name: String(formData.get('name') ?? ''),
        code: emptyToNull(formData.get('code')),
        parentId: emptyToNull(formData.get('parentId')),
      });
      if (!result.ok) setError(result.message ?? null);
    });
  }

  function addBranch(formData: FormData): void {
    setError(null);
    startTransition(async () => {
      const result = await createBranchAction({
        name: String(formData.get('name') ?? ''),
        code: emptyToNull(formData.get('code')),
        city: emptyToNull(formData.get('city')),
      });
      if (!result.ok) setError(result.message ?? null);
    });
  }

  function remove(kind: 'department' | 'branch', id: string): void {
    if (!globalThis.confirm(labels.deleteConfirm)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result =
        kind === 'department' ? await deleteDepartmentAction(id) : await deleteBranchAction(id);
      if (!result.ok) setError(result.message ?? null);
    });
  }

  return (
    <div className="mt-4 space-y-8">
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
          {labels.departments}
        </h3>

        {flat.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">{labels.empty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {flat.map((department) => (
              <li key={department.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className="flex-1 text-sm"
                  style={{ paddingInlineStart: `${department.depth * 16}px` }}
                >
                  {department.name}
                  {department.code ? (
                    <code className="ms-2 text-xs text-neutral-500">{department.code}</code>
                  ) : null}
                </span>
                <span className="text-xs text-neutral-500">
                  {department.memberCount} {labels.members}
                </span>
                <button
                  type="button"
                  onClick={() => remove('department', department.id)}
                  disabled={pending}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  {labels.delete}
                </button>
              </li>
            ))}
          </ul>
        )}

        {canAddDepartment ? (
          <form action={addDepartment} className="mt-3 flex flex-wrap items-end gap-2">
            <input
              name="name"
              required
              placeholder={labels.name}
              aria-label={labels.name}
              className={`${CONTROL} min-w-48 flex-1`}
            />
            <input
              name="code"
              placeholder={labels.code}
              aria-label={labels.code}
              className={`${CONTROL} w-32`}
            />
            <select name="parentId" aria-label={labels.parent} className={CONTROL}>
              <option value="">{labels.parent}</option>
              {flat.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {labels.add}
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">{labels.planLimit}</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
          {labels.branches}
        </h3>

        {branches.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">{labels.empty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {branches.map((branch) => (
              <li key={branch.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-sm">
                  {branch.name}
                  {branch.city ? (
                    <span className="ms-2 text-xs text-neutral-500">{branch.city}</span>
                  ) : null}
                </span>
                <span className="text-xs text-neutral-500">
                  {branch.memberCount} {labels.members}
                </span>
                <button
                  type="button"
                  onClick={() => remove('branch', branch.id)}
                  disabled={pending}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  {labels.delete}
                </button>
              </li>
            ))}
          </ul>
        )}

        {canAddBranch ? (
          <form action={addBranch} className="mt-3 flex flex-wrap items-end gap-2">
            <input
              name="name"
              required
              placeholder={labels.name}
              aria-label={labels.name}
              className={`${CONTROL} min-w-48 flex-1`}
            />
            <input
              name="code"
              placeholder={labels.code}
              aria-label={labels.code}
              className={`${CONTROL} w-32`}
            />
            <input
              name="city"
              placeholder={labels.city}
              aria-label={labels.city}
              className={`${CONTROL} w-40`}
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {labels.add}
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">{labels.planLimit}</p>
        )}
      </div>
    </div>
  );
}

function flatten(
  nodes: DepartmentNode[],
  depth = 0,
): Array<{ id: string; name: string; code: string | null; memberCount: number; depth: number }> {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      name: node.name,
      code: node.code,
      memberCount: node.memberCount,
      depth,
    },
    ...flatten(node.children, depth + 1),
  ]);
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}
