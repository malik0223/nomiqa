'use client';

import { useEffect, useState } from 'react';
import { Link } from '../../../../i18n/routing';
import { confirmPaymentAction } from '../actions';

interface Labels {
  checking: string;
  paid: string;
  pending: string;
  failed: string;
  retry: string;
  back: string;
}

/** أقصى عدد محاولات تأكيد قبل ترك الأمر لدورة الـWorker. */
const MAX_ATTEMPTS = 5;

/** الفاصل بين المحاولات. البوابة قد تتأخر ثوانٍ في تثبيت الحالة. */
const RETRY_DELAY_MS = 2_500;

/**
 * تأكيد الدفع بعد العودة.
 *
 * يستعلم بضع مرات ثم يتوقف: البوابة قد تعيد `pending` للحظات بعد
 * الدفع فعلياً. الاستعلام الأبدي كان سيُبقي تبويباً يطرق الخادم بلا
 * نهاية، والاستعلام مرة واحدة كان سيُظهر «معلّق» لعميل دفع بالفعل.
 *
 * التوقف ليس فقداناً للدفعة: دورة الفوترة في الـWorker تسوّي المعلّق،
 * والنداء الراجع من البوابة يصل مستقلاً عن هذه الصفحة.
 */
export function PaymentConfirmation({
  reference,
  labels,
}: {
  reference: string;
  labels: Labels;
}) {
  const [status, setStatus] = useState<'checking' | 'paid' | 'pending' | 'failed'>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      const result = await confirmPaymentAction(reference);

      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setStatus('failed');
        return;
      }

      if (result.status === 'paid') {
        setStatus('paid');
        return;
      }

      if (result.status === 'pending' && attempt < MAX_ATTEMPTS) {
        globalThis.setTimeout(() => {
          if (!cancelled) setAttempt((value) => value + 1);
        }, RETRY_DELAY_MS);
        return;
      }

      setStatus(result.status === 'pending' ? 'pending' : 'failed');
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, [reference, attempt]);

  return (
    <div>
      <h1 className="text-xl font-bold">
        {status === 'checking' ? labels.checking : null}
        {status === 'paid' ? labels.paid : null}
        {status === 'pending' ? labels.pending : null}
        {status === 'failed' ? labels.failed : null}
      </h1>

      <Link href="/billing" className="mt-6 inline-block text-brand-600 hover:underline">
        {labels.back}
      </Link>
    </div>
  );
}
