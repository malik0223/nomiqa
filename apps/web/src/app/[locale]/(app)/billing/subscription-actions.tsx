'use client';

import type { SubscriptionSummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { cancelSubscriptionAction, resumeSubscriptionAction } from './actions';
import { formatDate } from '@/lib/format';

interface Labels {
  renewsOn: string;
  cancel: string;
  cancelConfirm: string;
  cancelImmediate: string;
  resume: string;
  keep: string;
  processing: string;
}

/**
 * إلغاء الاشتراك واستئنافه.
 *
 * الإلغاء الفوري خيار داخل التأكيد لا زر مستقل: الافتراضي أن الخدمة
 * تستمر إلى نهاية الفترة المدفوعة، وجعل القطع الفوري ظاهراً بنفس بروز
 * الإلغاء العادي كان سيجعل عملاء يقطعون خدمةً دفعوا ثمنها بلا قصد.
 */
export function SubscriptionActions({
  subscription,
  locale,
  labels,
}: {
  subscription: SubscriptionSummary;
  locale: string;
  labels: Labels;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel(formData: FormData): void {
    setError(null);
    const immediate = formData.get('immediate') === 'on';

    startTransition(async () => {
      const result = await cancelSubscriptionAction({ immediate, reason: null });

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      setConfirming(false);
      globalThis.location.reload();
    });
  }

  function resume(): void {
    setError(null);

    startTransition(async () => {
      const result = await resumeSubscriptionAction();

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      globalThis.location.reload();
    });
  }

  return (
    <div className="mt-4 rounded-card border border-line p-5">
      <p className="text-sm text-muted">
        {labels.renewsOn}: {formatDate(subscription.currentPeriodEnd, locale)}
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger-500">
          {error}
        </p>
      ) : null}

      {subscription.cancelAtPeriodEnd ? (
        <button
          type="button"
          onClick={resume}
          disabled={pending}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? labels.processing : labels.resume}
        </button>
      ) : confirming ? (
        <form action={cancel} className="mt-4 space-y-3">
          <p className="text-sm">{labels.cancelConfirm}</p>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="immediate" className="h-4 w-4" />
            {labels.cancelImmediate}
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-danger-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? labels.processing : labels.cancel}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-3 py-2 text-sm text-faint"
            >
              {labels.keep}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 text-sm text-danger-500 hover:underline"
        >
          {labels.cancel}
        </button>
      )}
    </div>
  );
}
