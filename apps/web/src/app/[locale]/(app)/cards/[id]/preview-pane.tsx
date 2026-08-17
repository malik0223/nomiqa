'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CardSnapshot, TemplateDefinition } from '@nomiqa/contracts';
import { CardRenderer, cn } from '@nomiqa/ui';

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
    <div className="sticky top-24">
      <div className="mb-4 flex flex-wrap items-center gap-2">
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

      {/* علامات القصّ حول المعاينة: إشارة صريحة إلى أن ما بالداخل
          مادة ستُنشر للناس، لا لوحة تحكم أخرى داخل الشاشة. */}
      <div className="nq-crop mx-auto w-full max-w-[380px]">
        {/* إطار بمقاس هاتف: أغلب من يفتح البطاقة يفتحها من هاتف،
            فمعاينة بعرض سطح المكتب تخفي بالضبط ما سيراه الناس. */}
        <div
          className={cn(
            scheme === 'dark' ? 'theme-dark' : 'theme-light',
            'overflow-hidden rounded-[1.75rem] border-[6px] border-ink-900 shadow-float dark:border-ink-800',
          )}
        >
          <div className="h-[620px] overflow-y-auto bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50">
            <CardRenderer snapshot={snapshot} template={template} locale={previewLocale} />
          </div>
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
      className="inline-flex rounded-md border border-line bg-surface-2 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
            value === option.value ? 'bg-surface text-fg shadow-sheet' : 'text-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
