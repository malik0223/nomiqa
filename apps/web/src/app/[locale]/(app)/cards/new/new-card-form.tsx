'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { TemplateSummary } from '@nomiqa/contracts';
import { Alert, Button, Field, Input, Panel, Select, cn } from '@nomiqa/ui';
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
      <Panel className="flex flex-col gap-6">
        <Field htmlFor="fullName" label={t('cards.fields.fullName')} required>
          <Input id="fullName" name="fullName" required minLength={2} maxLength={120} />
        </Field>

        {/* لغة البطاقة منفصلة عن لغة الواجهة (§4.8) — موظف يستخدم
            اللوحة بالعربية قد ينشر بطاقة إنجليزية. */}
        <Field
          htmlFor="defaultLocale"
          label={t('cards.fields.defaultLocale')}
          hint={t('cards.fields.defaultLocaleHint')}
        >
          <Select id="defaultLocale" name="defaultLocale" defaultValue="ar">
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </Select>
        </Field>

        <fieldset>
          <legend className="text-[0.8125rem] font-medium text-fg">
            {t('cards.fields.template')}
          </legend>

          <div className="mt-2.5 grid gap-3 sm:grid-cols-3">
            {templates.map((template) => {
              const selected = templateKey === template.key;

              return (
                <label
                  key={template.key}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-3 rounded-md border p-4 text-center text-sm transition-colors',
                    selected
                      ? 'border-accent-line bg-accent-soft/50'
                      : 'border-line hover:border-line-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="templateKey"
                    value={template.key}
                    checked={selected}
                    onChange={() => setTemplateKey(template.key)}
                    className="sr-only"
                  />

                  {/* رسم تخطيطي صغير للقالب: اسم القالب وحده لا يخبر
                      المستخدم بشيء قبل أن يراه، والفرق بين «كلاسيكي»
                      و«بغلاف» فرق تخطيط لا فرق تسمية. */}
                  <TemplateSketch layout={template.key} selected={selected} />

                  <span className={cn('font-medium', selected && 'text-accent')}>
                    {locale === 'en' ? (template.nameEn ?? template.name) : template.name}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="flex items-center gap-3 border-t border-line pt-5">
          <Button type="submit" variant="primary" disabled={pending} iconEnd="arrowEnd">
            {pending ? t('common.loading') : t('cards.create')}
          </Button>
        </div>
      </Panel>
    </form>
  );
}

/** تخطيط مصغَّر للقالب: كتل رمادية تحاكي ترتيب أقسام البطاقة. */
function TemplateSketch({ layout, selected }: { layout: string; selected: boolean }) {
  const bar = selected ? 'bg-accent-line/50' : 'bg-surface-3';
  const solid = selected ? 'bg-accent-line' : 'bg-line-strong';

  return (
    <span
      aria-hidden="true"
      className="flex h-16 w-full max-w-24 flex-col items-center gap-1.5 rounded-sm border border-line bg-surface-2 p-2"
    >
      {layout === 'cover' ? <span className={cn('h-3 w-full rounded-xs', solid)} /> : null}
      <span className={cn('h-3.5 w-3.5 rounded-full', solid)} />
      <span className={cn('h-1 w-10 rounded-full', bar)} />
      <span className={cn('h-1.5 w-full rounded-xs', bar)} />
      <span className={cn('h-1.5 w-full rounded-xs', bar)} />
    </span>
  );
}
