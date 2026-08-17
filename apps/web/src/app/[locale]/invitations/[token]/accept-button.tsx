'use client';

import { useState, useTransition } from 'react';
import { acceptInvitationAction } from './actions';

/**
 * زر قبول الدعوة.
 *
 * ينتقل إلى لوحة التحكم بعد النجاح لا يبقى في الصفحة: من قبل دعوة
 * يريد الدخول إلى مؤسسته، وترك رسالة «تم» يجعله يبحث عن الرابط التالي.
 */
export function AcceptButton({
  token,
  locale,
  labels,
}: {
  token: string;
  locale: string;
  labels: { accept: string; processing: string };
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function accept(): void {
    setError(null);

    startTransition(async () => {
      const result = await acceptInvitationAction(token);

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      globalThis.location.href = `/${locale}/dashboard`;
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? labels.processing : labels.accept}
      </button>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
