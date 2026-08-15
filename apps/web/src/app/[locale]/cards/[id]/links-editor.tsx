'use client';

import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { CARD_LINK_TYPES, SOCIAL_PLATFORMS, type CardLinkType } from '@nomiqa/contracts';
import type { CardFormValues } from './form-types';

/** قيم افتراضية لكل نوع، حتى لا يبدأ المستخدم من حقل فارغ بلا سياق. */
const PLACEHOLDER: Record<CardLinkType, string> = {
  phone: '+96891234567',
  email: 'name@example.com',
  whatsapp: '+96891234567',
  website: 'example.com',
  booking: 'cal.com/name',
  social: 'linkedin.com/in/name',
  custom: 'example.com/page',
};

export function LinksEditor({
  control,
  register,
  watchedLinks,
}: {
  control: Control<CardFormValues>;
  register: UseFormRegister<CardFormValues>;
  watchedLinks: CardFormValues['links'];
}) {
  const t = useTranslations();
  const { fields, append, remove, move } = useFieldArray({ control, name: 'links' });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('cards.links.title')}</h2>
        <button
          type="button"
          onClick={() =>
            append({
              type: 'phone',
              platform: '',
              label: '',
              labelEn: '',
              value: '',
              isVisible: true,
              isPrimary: false,
            })
          }
          className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
        >
          {t('cards.links.add')}
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('cards.links.empty')}</p>
      ) : null}

      <ul className="space-y-4">
        {fields.map((field, index) => {
          const type = watchedLinks[index]?.type ?? 'phone';

          return (
            <li
              key={field.id}
              className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={t('cards.links.type')}
                  {...register(`links.${index}.type` as const)}
                  className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  {CARD_LINK_TYPES.map((linkType) => (
                    <option key={linkType} value={linkType}>
                      {t(`cards.links.types.${linkType}`)}
                    </option>
                  ))}
                </select>

                {type === 'social' ? (
                  <select
                    aria-label={t('cards.links.platform')}
                    {...register(`links.${index}.platform` as const)}
                    className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <option value="">—</option>
                    {SOCIAL_PLATFORMS.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform}
                      </option>
                    ))}
                  </select>
                ) : null}

                <div className="ms-auto flex items-center gap-1">
                  {/* الترتيب بأزرار لا بالسحب: السحب يعمل بالفأرة وحدها،
                      والمحرر يُستخدم على الهاتف أيضاً. */}
                  <IconButton
                    label={t('cards.links.moveUp')}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    label={t('cards.links.moveDown')}
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    ↓
                  </IconButton>
                  <IconButton label={t('cards.links.remove')} onClick={() => remove(index)}>
                    ✕
                  </IconButton>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`link-value-${field.id}`}
                    className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
                  >
                    {t('cards.links.value')}
                  </label>
                  <input
                    id={`link-value-${field.id}`}
                    // الأرقام والروابط لاتينية دائماً حتى في واجهة عربية.
                    dir="ltr"
                    placeholder={PLACEHOLDER[type]}
                    {...register(`links.${index}.value` as const)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`link-label-${field.id}`}
                    className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
                  >
                    {t('cards.links.label')}
                  </label>
                  <input
                    id={`link-label-${field.id}`}
                    placeholder={t('cards.links.labelPlaceholder')}
                    {...register(`links.${index}.label` as const)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" {...register(`links.${index}.isPrimary` as const)} />
                  {t('cards.links.primary')}
                </label>

                <label className="flex items-center gap-2">
                  <input type="checkbox" {...register(`links.${index}.isVisible` as const)} />
                  {t('cards.links.visible')}
                </label>
              </div>

              {watchedLinks[index]?.isVisible === false ? (
                <p className="mt-2 text-xs text-neutral-500">{t('cards.links.hiddenHint')}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-800"
    >
      {children}
    </button>
  );
}
