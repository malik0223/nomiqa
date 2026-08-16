'use client';

import type { WalletAvailability } from '@nomiqa/contracts';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { issueWalletPassAction } from '../actions';

/**
 * إضافة البطاقة إلى محفظة الهاتف (§10.2).
 *
 * زرّان لا زر: المنصتان مختلفتان في آلية التسليم، وإخفاء ذلك خلف زر
 * واحد «أضف إلى المحفظة» كان يعني سلوكاً مختلفاً بلا تفسير — رابط
 * يُفتح هنا وملف يُنزَّل هناك.
 *
 * والزر المعطّل يظهر بسببه لا يختفي: مؤسسة لا ترى الميزة لا تعرف أنها
 * موجودة، فلا تسأل عنها ولا ترقّي باقتها.
 */
export function WalletBox({
  cardId,
  availability,
}: {
  cardId: string;
  availability: WalletAvailability;
}) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function issue(platform: 'apple' | 'google'): void {
    setError(null);

    startTransition(async () => {
      const result = await issueWalletPassAction({ cardId, platform });

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      // Google تعطي رابطاً يفتحه المستخدم فتضيف البطاقة، وApple تعطي
      // مساراً يُنزَّل منه ملف يفتحه النظام. كلاهما تنقّل خارج التطبيق.
      const destination = result.issue?.saveUrl ?? result.issue?.downloadPath;
      if (destination) globalThis.location.assign(destination);
    });
  }

  if (!availability.apple && !availability.google) {
    return null;
  }

  return (
    <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">{t('wallet.title')}</h2>
      <p className="mt-1 text-xs text-neutral-500">{t('wallet.hint')}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {availability.apple ? (
          <button
            type="button"
            onClick={() => issue('apple')}
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {t('wallet.apple')}
          </button>
        ) : null}

        {availability.google ? (
          <button
            type="button"
            onClick={() => issue('google')}
            disabled={pending}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('wallet.google')}
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
