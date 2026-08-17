'use client';

import type { ChangeRequestSummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { withdrawChangeRequestAction } from './actions';
import { formatDate } from '@/lib/format';

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
    return <p className="mt-3 text-sm text-faint">{labels.empty}</p>;
  }

  return (
    <div className="mt-4">
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger-500">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-line rounded-card border border-line bg-surface shadow-sheet">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <p className="text-sm">/{request.cardSlug}</p>
              <p className="text-xs text-faint">{request.changedFields.join('، ')}</p>
              {request.reviewNote ? (
                <p className="mt-1 text-xs text-muted">
                  {request.reviewNote}
                </p>
              ) : null}
            </div>

            <span className="text-xs text-faint">
              {labels.statusLabel[request.status] ?? request.status}
            </span>

            <span className="text-xs text-faint">
              {formatDate(request.createdAt, locale)}
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
                className="text-xs text-danger-500 hover:underline disabled:opacity-50"
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
