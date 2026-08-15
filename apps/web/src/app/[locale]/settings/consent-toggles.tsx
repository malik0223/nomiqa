'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { ConsentStatus } from '@nomiqa/contracts';
import { updateConsentAction } from './actions';

/**
 * الموافقات الإلزامية تُعرض للاطلاع ولا تُسحب من هنا: سحبها يعني
 * إنهاء استخدام الخدمة، وذلك مسار حذف الحساب لا مفتاح تبديل.
 */
const REQUIRED = new Set(['terms', 'privacy']);

export function ConsentToggles({ consents }: { consents: ConsentStatus[] }) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-4 space-y-3">
      {consents.map((consent) => {
        const required = REQUIRED.has(consent.purpose);

        return (
          <div
            key={consent.purpose}
            className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div>
              <p className="text-sm font-medium">{t(`settings.consent.${consent.purpose}`)}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {consent.granted ? t('settings.consent.granted') : t('settings.consent.notGranted')}
                {consent.updatedAt
                  ? ` · ${new Date(consent.updatedAt).toLocaleDateString('ar')}`
                  : ''}
              </p>
            </div>

            {required ? (
              <span className="shrink-0 text-xs text-neutral-500">
                {t('settings.consent.required')}
              </span>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await updateConsentAction(consent.purpose, !consent.granted);
                    if (!result.ok) setError(result.message ?? t('errors.generic'));
                  });
                }}
                className="shrink-0 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              >
                {consent.granted ? t('settings.consent.withdraw') : t('settings.consent.grant')}
              </button>
            )}
          </div>
        );
      })}

      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
