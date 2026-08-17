'use client';

import { useState, useTransition } from 'react';
import { reviewChangeRequestAction } from '../actions';

/**
 * لوحة البتّ في الطلب.
 *
 * الملاحظة مطلوبة عند الرفض لا عند الموافقة: من رُفض طلبه يحتاج أن
 * يعرف ما يصحّحه، وإلا أعاد إرسال الطلب نفسه فدارت الحلقة.
 */
export function ReviewPanel({
  requestId,
  labels,
}: {
  requestId: string;
  labels: {
    approve: string;
    reject: string;
    note: string;
    noteRequired: string;
    processing: string;
  };
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function review(decision: 'approve' | 'reject'): void {
    setError(null);

    if (decision === 'reject' && note.trim().length === 0) {
      setError(labels.noteRequired);
      return;
    }

    startTransition(async () => {
      const result = await reviewChangeRequestAction(requestId, {
        decision,
        note: note.trim() || null,
      });

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      globalThis.location.reload();
    });
  }

  return (
    <section className="mt-8 rounded-card border border-line p-5">
      <label className="block text-sm font-medium" htmlFor="review-note">
        {labels.note}
      </label>
      <textarea
        id="review-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
      />

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger-500">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => review('approve')}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? labels.processing : labels.approve}
        </button>
        <button
          type="button"
          onClick={() => review('reject')}
          disabled={pending}
          className="rounded-lg border border-danger-100 px-4 py-2 text-sm font-medium text-danger-500 disabled:opacity-50 dark:border-red-800"
        >
          {labels.reject}
        </button>
      </div>
    </section>
  );
}
