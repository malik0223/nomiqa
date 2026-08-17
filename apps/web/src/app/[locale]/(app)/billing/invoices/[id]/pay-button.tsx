'use client';

import { useState, useTransition } from 'react';
import { payInvoiceAction } from '../../actions';

/**
 * زر سداد الفاتورة.
 *
 * يعيد استخدام جلسة الدفع القائمة إن وُجدت بدل فتح ثانية: كل جلسة
 * رابط دفع حي، وفتح اثنين لفاتورة واحدة يسمح بدفعها مرتين.
 */
export function PayInvoiceButton({
  invoiceId,
  existingUrl,
  labels,
}: {
  invoiceId: string;
  existingUrl: string | null;
  labels: { pay: string; processing: string };
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pay(): void {
    if (existingUrl) {
      globalThis.location.href = existingUrl;
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await payInvoiceAction(invoiceId);

      if (!result.ok || !result.checkoutUrl) {
        setError(result.message ?? null);
        return;
      }

      globalThis.location.href = result.checkoutUrl;
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={pay}
        disabled={pending}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? labels.processing : labels.pay}
      </button>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
