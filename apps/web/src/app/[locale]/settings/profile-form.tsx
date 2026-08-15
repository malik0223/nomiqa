'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { UserProfile } from '@nomiqa/contracts';
import { updateProfileAction, type ActionResult } from './actions';

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <form
      className="mt-4 space-y-4"
      action={(formData) => {
        setResult(null);
        startTransition(async () => {
          setResult(await updateProfileAction(formData));
        });
      }}
    >
      <div>
        <label htmlFor="fullName" className="block text-sm font-medium">
          {t('settings.fullName')}
        </label>
        <input
          id="fullName"
          name="fullName"
          defaultValue={profile.fullName ?? ''}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          {t('settings.email')}
        </label>
        <input
          id="email"
          value={profile.email}
          disabled
          className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900"
        />
        {/* تغيير البريد يحتاج إعادة تحقق — راجع docs/privacy/rectification.md */}
        <p className="mt-1 text-xs text-neutral-500">{t('settings.emailLocked')}</p>
      </div>

      <div>
        <label htmlFor="locale" className="block text-sm font-medium">
          {t('settings.locale')}
        </label>
        <select
          id="locale"
          name="locale"
          defaultValue={profile.locale}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </div>

      <div>
        <label htmlFor="timeZone" className="block text-sm font-medium">
          {t('settings.timeZone')}
        </label>
        <input
          id="timeZone"
          name="timeZone"
          defaultValue={profile.timeZone}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? t('common.loading') : t('settings.save')}
        </button>

        {result?.ok ? (
          <span role="status" className="text-sm text-green-700 dark:text-green-400">
            {t('settings.saved')}
          </span>
        ) : null}
        {result && !result.ok ? (
          <span role="alert" className="text-sm text-red-700 dark:text-red-400">
            {result.message ?? t('errors.generic')}
          </span>
        ) : null}
      </div>
    </form>
  );
}
