'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CardSnapshot, TemplateDefinition } from '@nomiqa/contracts';
import { CardRenderer } from '@nomiqa/ui';

/**
 * معاينة الهاتف.
 *
 * تعرض بمحرك العرض نفسه الذي يخدم الصفحة العامة (§4.4)، لا بنسخة
 * مبسّطة منه: معاينة تختلف عن النتيجة أسوأ من غياب المعاينة، لأنها
 * تُبنى عليها قرارات تصميم خاطئة.
 */
export function PreviewPane({
  snapshot,
  template,
}: {
  snapshot: CardSnapshot;
  template: TemplateDefinition;
}) {
  const t = useTranslations();
  const [previewLocale, setPreviewLocale] = useState<'ar' | 'en'>(
    snapshot.defaultLocale === 'en' ? 'en' : 'ar',
  );
  const [scheme, setScheme] = useState<'light' | 'dark'>('light');

  return (
    <div className="sticky top-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ToggleGroup
          label={t('cards.preview.language')}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
          value={previewLocale}
          onChange={(value) => setPreviewLocale(value as 'ar' | 'en')}
        />

        <ToggleGroup
          label={t('cards.preview.scheme')}
          options={[
            { value: 'light', label: t('cards.preview.light') },
            { value: 'dark', label: t('cards.preview.dark') },
          ]}
          value={scheme}
          onChange={(value) => setScheme(value as 'light' | 'dark')}
        />
      </div>

      {/* إطار بمقاس هاتف: أغلب من يفتح البطاقة يفتحها من هاتف، فمعاينة
          بعرض سطح المكتب تخفي بالضبط ما سيراه الناس. */}
      <div
        className={`${scheme === 'dark' ? 'theme-dark' : 'theme-light'} mx-auto w-full max-w-[380px] overflow-hidden rounded-3xl border-4 border-neutral-800 shadow-xl`}
      >
        <div className="h-[640px] overflow-y-auto bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
          <CardRenderer snapshot={snapshot} template={template} locale={previewLocale} />
        </div>
      </div>
    </div>
  );
}

function ToggleGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            value === option.value
              ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
              : 'text-neutral-600 dark:text-neutral-400'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
