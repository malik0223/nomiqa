'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { TemplateSummary } from '@nomiqa/contracts';
import { createCardAction } from '../actions';

/**
 * إنشاء البطاقة بأقل عدد ممكن من الحقول.
 *
 * بوابة الخروج من المرحلة 2 تشترط إنشاء بطاقة ونشرها في **أقل من خمس
 * دقائق**. لذلك: الاسم والقالب فقط، والباقي في المحرر بعد أن يرى
 * المستخدم شيئاً ملموساً.
 */
export function NewCardForm({
  templates,
  locale,
}: {
  templates: TemplateSummary[];
  locale: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? 'classic');

  return (
    <form
      className="mt-8 space-y-6"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await createCardAction({
            fullName: String(formData.get('fullName') ?? ''),
            templateKey,
            defaultLocale: (formData.get('defaultLocale') as 'ar' | 'en') ?? 'ar',
          });

          if (result.ok) {
            router.push(`/${locale}/cards/${result.cardId}`);
            return;
          }

          setError(result.message ?? t('errors.generic'));
        });
      }}
    >
      <div>
        <label htmlFor="fullName" className="block text-sm font-medium">
          {t('cards.fields.fullName')}
        </label>
        <input
          id="fullName"
          name="fullName"
          required
          minLength={2}
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      <div>
        <label htmlFor="defaultLocale" className="block text-sm font-medium">
          {t('cards.fields.defaultLocale')}
        </label>
        {/* لغة البطاقة منفصلة عن لغة الواجهة (§4.8) — موظف يستخدم
            اللوحة بالعربية قد ينشر بطاقة إنجليزية. */}
        <select
          id="defaultLocale"
          name="defaultLocale"
          defaultValue="ar"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
        <p className="mt-1 text-xs text-neutral-500">{t('cards.fields.defaultLocaleHint')}</p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">{t('cards.fields.template')}</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {templates.map((template) => (
            <label
              key={template.key}
              className={`cursor-pointer rounded-xl border p-4 text-center text-sm transition-colors ${
                templateKey === template.key
                  ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800'
              }`}
            >
              <input
                type="radio"
                name="templateKey"
                value={template.key}
                checked={templateKey === template.key}
                onChange={() => setTemplateKey(template.key)}
                className="sr-only"
              />
              <span className="font-medium">
                {locale === 'en' ? (template.nameEn ?? template.name) : template.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? t('common.loading') : t('cards.create')}
        </button>

        {error ? (
          <span role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
