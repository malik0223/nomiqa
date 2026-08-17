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
          className="mt-1.5 w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-fg transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent-line focus:bg-surface"
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
          className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-faint"
        />
        {/* تغيير البريد يحتاج إعادة تحقق — راجع docs/privacy/rectification.md */}
        <p className="mt-1 text-xs text-faint">{t('settings.emailLocked')}</p>
      </div>

      <div>
        <label htmlFor="locale" className="block text-sm font-medium">
          {t('settings.locale')}
        </label>
        <select
          id="locale"
          name="locale"
          defaultValue={profile.locale}
          className="mt-1.5 w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-fg transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent-line focus:bg-surface"
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
          className="mt-1.5 w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-fg transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent-line focus:bg-surface"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-fg shadow-sheet transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          {pending ? t('common.loading') : t('settings.save')}
        </button>

        {result?.ok ? (
          <span role="status" className="text-sm text-success-600 dark:text-green-400">
            {t('settings.saved')}
          </span>
        ) : null}
        {result && !result.ok ? (
          <span role="alert" className="text-sm text-danger-600">
            {result.message ?? t('errors.generic')}
          </span>
        ) : null}
      </div>
    </form>
  );
}
