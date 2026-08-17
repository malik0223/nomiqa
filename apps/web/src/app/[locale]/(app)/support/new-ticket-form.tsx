'use client';

import { useState, useTransition } from 'react';
import { createTicketAction } from '../billing/actions';

const CONTROL =
  'rounded-lg border border-line bg-white px-3 py-2 text-sm';

interface Labels {
  subject: string;
  category: string;
  priority: string;
  body: string;
  submit: string;
  sending: string;
  categories: Record<string, string>;
  priorities: Record<string, string>;
}

/** نموذج فتح تذكرة دعم. */
export function NewTicketForm({ locale, labels }: { locale: string; labels: Labels }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData): void {
    setError(null);

    startTransition(async () => {
      const result = await createTicketAction({
        subject: String(formData.get('subject') ?? ''),
        category: String(formData.get('category') ?? 'other'),
        priority: String(formData.get('priority') ?? 'normal'),
        body: String(formData.get('body') ?? ''),
      });

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      globalThis.location.href = `/${locale}/support/${result.id}`;
    });
  }

  return (
    <form action={submit} className="mt-4 space-y-3">
      <input
        name="subject"
        required
        placeholder={labels.subject}
        aria-label={labels.subject}
        className={`${CONTROL} w-full`}
      />

      <div className="flex flex-wrap gap-2">
        <select name="category" aria-label={labels.category} className={CONTROL}>
          {Object.entries(labels.categories).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select name="priority" defaultValue="normal" aria-label={labels.priority} className={CONTROL}>
          {Object.entries(labels.priorities).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <textarea
        name="body"
        required
        rows={5}
        placeholder={labels.body}
        aria-label={labels.body}
        className={`${CONTROL} w-full`}
      />

      {error ? (
        <p role="alert" className="text-sm text-danger-500">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? labels.sending : labels.submit}
      </button>
    </form>
  );
}
