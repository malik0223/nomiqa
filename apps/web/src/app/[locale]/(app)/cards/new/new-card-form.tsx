'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { TemplateSummary } from '@nomiqa/contracts';
import { Alert, Button, Field, Input, Panel, Select, cn, surfaceSwatch } from '@nomiqa/ui';
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

          <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                  <TemplateSketch definition={template.definition} selected={selected} />

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
/**
 * مصغّر القالب.
 *
 * يرسم بألوان القالب الحقيقية لا بألوان الواجهة: الفرق بين «نيون»
 * و«صحيفة» لونٌ وتباين قبل أن يكون تخطيطاً، ومصغّر رمادي موحّد يجعل
 * أحد عشر قالباً تبدو واحداً.
 */
function TemplateSketch({
  definition,
  selected,
}: {
  definition: TemplateSummary['definition'];
  selected: boolean;
}) {
  const swatch = surfaceSwatch(definition.surface);
  const accent = definition.theme.primaryColor ?? swatch.ink;
  const centered = definition.layout === 'centered' || definition.layout === 'cover';
  const grid = definition.surface === 'bento';

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-16 w-full max-w-24 flex-col gap-1.5 overflow-hidden rounded-sm border p-2',
        centered ? 'items-center' : 'items-start',
        selected ? 'border-accent-line' : 'border-line',
      )}
      style={{ backgroundColor: swatch.bg }}
    >
      {definition.supportsCover ? (
        <span className="h-3 w-full rounded-xs" style={{ backgroundColor: accent, opacity: 0.75 }} />
      ) : null}

      <span
        className={cn('h-3.5 w-3.5 shrink-0', grid ? 'rounded-xs' : 'rounded-full')}
        style={{ backgroundColor: accent }}
      />
      <span className="h-1 w-10 rounded-full" style={{ backgroundColor: swatch.ink, opacity: 0.8 }} />

      {grid ? (
        <span className="grid w-full grid-cols-2 gap-0.5">
          <span className="h-1.5 rounded-xs" style={{ backgroundColor: swatch.ink, opacity: 0.28 }} />
          <span className="h-1.5 rounded-xs" style={{ backgroundColor: swatch.ink, opacity: 0.28 }} />
          <span className="h-1.5 rounded-xs" style={{ backgroundColor: swatch.ink, opacity: 0.28 }} />
          <span className="h-1.5 rounded-xs" style={{ backgroundColor: swatch.ink, opacity: 0.28 }} />
        </span>
      ) : (
        <>
          <span
            className="h-1.5 w-full rounded-xs"
            style={{ backgroundColor: swatch.ink, opacity: 0.28 }}
          />
          <span
            className="h-1.5 w-full rounded-xs"
            style={{ backgroundColor: swatch.ink, opacity: 0.28 }}
          />
        </>
      )}
    </span>
  );
}
