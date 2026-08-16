'use client';

import type { ChangeRequestSummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { withdrawChangeRequestAction } from './actions';

/** طلبات الموظف نفسه، مع سحب المعلّق منها. */
export function MyRequests({
  requests,
  locale,
  labels,
}: {
  requests: ChangeRequestSummary[];
  locale: string;
  labels: { empty: string; withdraw: string; statusLabel: Record<string, string> };
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (requests.length === 0) {
    return <p className="mt-3 text-sm text-neutral-500">{labels.empty}</p>;
  }

  return (
    <div className="mt-4">
      {error ? (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <p className="text-sm">/{request.cardSlug}</p>
              <p className="text-xs text-neutral-500">{request.changedFields.join('، ')}</p>
              {request.reviewNote ? (
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  {request.reviewNote}
                </p>
              ) : null}
            </div>

            <span className="text-xs text-neutral-500">
              {labels.statusLabel[request.status] ?? request.status}
            </span>

            <span className="text-xs text-neutral-400">
              {new Date(request.createdAt).toLocaleDateString(locale)}
            </span>

            {request.status === 'pending' ? (
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    const result = await withdrawChangeRequestAction(request.id);
                    if (!result.ok) setError(result.message ?? null);
                  })
                }
                disabled={pending}
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                {labels.withdraw}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
