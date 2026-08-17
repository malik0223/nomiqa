'use client';

import type { CardSummary, NfcTagSummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { assignTagAction, issueTagAction, revokeTagAction } from './actions';

interface Labels {
  label: string;
  card: string;
  unassigned: string;
  issue: string;
  writeUrl: string;
  copy: string;
  copied: string;
  scans: string;
  never: string;
  reassign: string;
  detach: string;
  revoke: string;
  revokeReason: string;
  revokeWithReplacement: string;
  revokeConfirm: string;
  empty: string;
  planLimit: string;
  noPublishedCards: string;
  status: Record<string, string>;
}

/**
 * إدارة وسوم NFC (§10.2).
 *
 * ثلاثة قرارات في هذه الواجهة تستحق الشرح:
 *
 *  1. **رابط الكتابة معروض دائماً وبزر نسخ.** الوسم يُكتب بتطبيق خارجي
 *     على هاتف المسؤول، وأي خطأ في نسخ الرابط ينتج وسماً معدنياً
 *     يؤدي إلى لا شيء — بعد أن يكون قد وُزّع.
 *  2. **الإبطال يطلب سبباً ويعرض تأكيداً.** لا رجعة فيه، والوسم البديل
 *     يُصدر في العملية نفسها فلا يبقى الموظف بلا وسم.
 *  3. **الوسم المُبطل يبقى في القائمة.** قطعة معدنية ما زالت في العالم،
 *     وإخفاؤها من الشاشة لا يخفيها من الواقع.
 */
export function TagsPanel({
  tags,
  cards,
  available,
  labels,
}: {
  tags: NfcTagSummary[];
  cards: CardSummary[];
  available: boolean;
  labels: Labels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!available) {
    return <p className="mt-4 text-sm text-faint">{labels.planLimit}</p>;
  }

  function issue(formData: FormData): void {
    setError(null);
    startTransition(async () => {
      const cardId = String(formData.get('cardId') ?? '');
      const result = await issueTagAction({
        label: String(formData.get('label') ?? '').trim() || null,
        cardId: cardId || null,
      });

      if (!result.ok) setError(result.message ?? null);
    });
  }

  function assign(id: string, cardId: string): void {
    setError(null);
    startTransition(async () => {
      const result = await assignTagAction(id, { cardId: cardId || null });
      if (!result.ok) setError(result.message ?? null);
    });
  }

  function revoke(id: string, formData: FormData): void {
    if (!globalThis.confirm(labels.revokeConfirm)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await revokeTagAction(id, {
        reason: String(formData.get('reason') ?? ''),
        issueReplacement: formData.get('replacement') === 'on',
      });

      if (result.ok) setRevoking(null);
      else setError(result.message ?? null);
    });
  }

  return (
    <div className="mt-4">
      <form action={issue} className="flex flex-wrap items-end gap-3">
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-muted">{labels.label}</span>
          <input
            name="label"
            maxLength={80}
            className="w-full rounded-lg border border-line px-3 py-2"
          />
        </label>

        <label className="flex-1 text-sm">
          <span className="mb-1 block text-muted">{labels.card}</span>
          <select
            name="cardId"
            className="w-full rounded-lg border border-line px-3 py-2"
          >
            <option value="">{labels.unassigned}</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.fullName}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg shadow-sheet transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          {labels.issue}
        </button>
      </form>

      {cards.length === 0 ? (
        <p className="mt-2 text-xs text-amber-600">{labels.noPublishedCards}</p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-danger-500">{error}</p> : null}

      {tags.length === 0 ? (
        <p className="mt-6 text-sm text-faint">{labels.empty}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="rounded-card border border-line bg-surface p-4 shadow-sheet"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{tag.label ?? tag.code}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    {tag.cardOwnerName ?? labels.unassigned} ·{' '}
                    <span className="font-mono" dir="ltr">
                      {tag.code}
                    </span>
                  </p>
                </div>

                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
                  {labels.status[tag.status] ?? tag.status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-faint">{labels.writeUrl}:</span>
                <code className="truncate rounded bg-surface-2 px-2 py-1" dir="ltr">
                  {tag.writeUrl}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(tag.writeUrl);
                    setCopied(tag.id);
                    setTimeout(() => setCopied(null), 2000);
                  }}
                  className="rounded-lg bg-surface-2 px-2.5 py-1 font-medium hover:bg-surface-3"
                >
                  {copied === tag.id ? labels.copied : labels.copy}
                </button>
              </div>

              <p className="mt-2 text-xs text-faint">
                {labels.scans}: {tag.scanCount} ·{' '}
                {tag.lastScanAt ? new Date(tag.lastScanAt).toLocaleDateString() : labels.never}
              </p>

              {tag.status === 'revoked' ? (
                <p className="mt-2 text-xs text-faint">{tag.revokedReason}</p>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    defaultValue={tag.cardId ?? ''}
                    onChange={(event) => assign(tag.id, event.target.value)}
                    disabled={pending}
                    className="rounded-lg border border-line px-2 py-1 text-xs"
                    aria-label={labels.reassign}
                  >
                    <option value="">{labels.detach}</option>
                    {cards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.fullName}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setRevoking(revoking === tag.id ? null : tag.id)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-danger-500 hover:bg-danger-50 dark:hover:bg-red-950"
                  >
                    {labels.revoke}
                  </button>
                </div>
              )}

              {revoking === tag.id ? (
                <form
                  action={(formData) => revoke(tag.id, formData)}
                  className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-3"
                >
                  <label className="flex-1 text-xs">
                    <span className="mb-1 block text-muted">
                      {labels.revokeReason}
                    </span>
                    <input
                      name="reason"
                      required
                      minLength={3}
                      maxLength={200}
                      className="w-full rounded-lg border border-line px-2 py-1.5"
                    />
                  </label>

                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="replacement" defaultChecked />
                    {labels.revokeWithReplacement}
                  </label>

                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-danger-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {labels.revoke}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
