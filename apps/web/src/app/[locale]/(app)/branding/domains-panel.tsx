'use client';

import type { CustomDomainSummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { addDomainAction, removeDomainAction } from './actions';

interface Labels {
  hostname: string;
  add: string;
  delete: string;
  deleteConfirm: string;
  verifyHint: string;
  recordName: string;
  recordValue: string;
  copy: string;
  copied: string;
  empty: string;
  planLimit: string;
  statusLabel: Record<string, string>;
}

/**
 * النطاقات المخصصة (§9.3).
 *
 * سجل TXT معروض كاملاً مع زر نسخ: العميل ينسخه إلى لوحة DNS عنده،
 * وخطأ حرف واحد يعني فشل تحقق لا سبب ظاهر له. الفحص يجري في الخلفية
 * كل ربع ساعة، والحالة تتحدث بلا تدخل.
 */
export function DomainsPanel({
  domains,
  available,
  labels,
}: {
  domains: CustomDomainSummary[];
  available: boolean;
  labels: Labels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!available) {
    return <p className="mt-4 text-sm text-faint">{labels.planLimit}</p>;
  }

  function add(formData: FormData): void {
    setError(null);
    startTransition(async () => {
      const result = await addDomainAction({ hostname: String(formData.get('hostname') ?? '') });
      if (!result.ok) setError(result.message ?? null);
    });
  }

  function remove(id: string): void {
    if (!globalThis.confirm(labels.deleteConfirm)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await removeDomainAction(id);
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

      {domains.length === 0 ? (
        <p className="text-sm text-faint">{labels.empty}</p>
      ) : (
        <ul className="space-y-3">
          {domains.map((domain) => (
            <li
              key={domain.id}
              className="rounded-card border border-line bg-surface p-4 shadow-sheet"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex-1 font-mono text-sm">{domain.hostname}</span>
                <span className="text-xs text-faint">
                  {labels.statusLabel[domain.status] ?? domain.status}
                </span>
                <button
                  type="button"
                  onClick={() => remove(domain.id)}
                  disabled={pending}
                  className="text-xs text-danger-500 hover:underline disabled:opacity-50"
                >
                  {labels.delete}
                </button>
              </div>

              {domain.status !== 'active' ? (
                <div className="mt-3 rounded-lg bg-surface-2 p-3 text-xs">
                  <p className="text-muted">{labels.verifyHint}</p>

                  <dl className="mt-2 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <dt className="text-faint">{labels.recordName}</dt>
                      <dd className="flex-1 overflow-x-auto font-mono">
                        {domain.verificationRecordName}
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <dt className="text-faint">{labels.recordValue}</dt>
                      <dd className="flex-1 overflow-x-auto font-mono">
                        {domain.verificationToken}
                      </dd>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(domain.verificationToken)
                            .then(() => setCopied(domain.id));
                        }}
                        className="rounded border border-line px-2 py-1"
                      >
                        {copied === domain.id ? labels.copied : labels.copy}
                      </button>
                    </div>
                  </dl>

                  {domain.failureReason ? (
                    <p className="mt-2 text-danger-500">{domain.failureReason}</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form action={add} className="mt-4 flex flex-wrap gap-2">
        <input
          name="hostname"
          required
          placeholder="cards.example.om"
          aria-label={labels.hostname}
          className="min-w-56 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm"
        />
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
