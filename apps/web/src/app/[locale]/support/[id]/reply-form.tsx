'use client';

import { useRef, useState, useTransition } from 'react';
import { replyToTicketAction } from '../../billing/actions';

/** الرد على تذكرة. */
export function ReplyForm({
  ticketId,
  labels,
}: {
  ticketId: string;
  labels: { body: string; submit: string; sending: string };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData): void {
    setError(null);

    startTransition(async () => {
      const result = await replyToTicketAction(ticketId, String(formData.get('body') ?? ''));

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      formRef.current?.reset();
      globalThis.location.reload();
    });
  }

  return (
    <form ref={formRef} action={submit} className="mt-8">
      <textarea
        name="body"
        required
        rows={4}
        placeholder={labels.body}
        aria-label={labels.body}
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      />

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? labels.sending : labels.submit}
      </button>
    </form>
  );
}
