'use client';

import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { CARD_LINK_TYPES, SOCIAL_PLATFORMS, type CardLinkType } from '@nomiqa/contracts';
import { Button, EmptyState, Field, Icon, Input, Panel, PanelHeader, Select } from '@nomiqa/ui';
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
    <Panel>
      <PanelHeader
        icon="link"
        title={t('cards.links.title')}
        description={t('cards.links.hint')}
        actions={
          <Button
            size="sm"
            icon="plus"
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
          >
            {t('cards.links.add')}
          </Button>
        }
      />

      {fields.length === 0 ? (
        <EmptyState className="mt-5" icon="link" title={t('cards.links.empty')} />
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {fields.map((field, index) => {
            const type = watchedLinks[index]?.type ?? 'phone';
            const isPrimary = watchedLinks[index]?.isPrimary ?? false;
            const isHidden = watchedLinks[index]?.isVisible === false;

            return (
              <li
                key={field.id}
                className={`rounded-md border p-4 transition-colors ${
                  isPrimary ? 'border-accent-line/50 bg-accent-soft/25' : 'border-line bg-surface-2/50'
                } ${isHidden ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label={t('cards.links.type')}
                    {...register(`links.${index}.type` as const)}
                    className="h-9 w-auto min-w-32"
                  >
                    {CARD_LINK_TYPES.map((linkType) => (
                      <option key={linkType} value={linkType}>
                        {t(`cards.links.types.${linkType}`)}
                      </option>
                    ))}
                  </Select>

                  {type === 'social' ? (
                    <Select
                      aria-label={t('cards.links.platform')}
                      {...register(`links.${index}.platform` as const)}
                      className="h-9 w-auto min-w-28"
                    >
                      <option value="">—</option>
                      {SOCIAL_PLATFORMS.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </Select>
                  ) : null}

                  <div className="ms-auto flex items-center gap-0.5">
                    {/* الترتيب بأزرار لا بالسحب: السحب يعمل بالفأرة وحدها،
                        والمحرر يُستخدم على الهاتف أيضاً. */}
                    <IconButton
                      label={t('cards.links.moveUp')}
                      icon="chevronUp"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    />
                    <IconButton
                      label={t('cards.links.moveDown')}
                      icon="chevronDown"
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                    />
                    <IconButton
                      label={t('cards.links.remove')}
                      icon="trash"
                      danger
                      onClick={() => remove(index)}
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field htmlFor={`link-value-${field.id}`} label={t('cards.links.value')}>
                    <Input
                      id={`link-value-${field.id}`}
                      // الأرقام والروابط لاتينية دائماً حتى في واجهة عربية.
                      dir="ltr"
                      placeholder={PLACEHOLDER[type]}
                      {...register(`links.${index}.value` as const)}
                    />
                  </Field>

                  <Field htmlFor={`link-label-${field.id}`} label={t('cards.links.label')}>
                    <Input
                      id={`link-label-${field.id}`}
                      placeholder={t('cards.links.labelPlaceholder')}
                      {...register(`links.${index}.label` as const)}
                    />
                  </Field>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-[0.8125rem]">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      {...register(`links.${index}.isPrimary` as const)}
                    />
                    {t('cards.links.primary')}
                  </label>

                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      {...register(`links.${index}.isVisible` as const)}
                    />
                    {t('cards.links.visible')}
                  </label>
                </div>

                {isHidden ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-faint">
                    <Icon name="eye" size={13} />
                    {t('cards.links.hiddenHint')}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function IconButton({
  label,
  icon,
  disabled,
  danger = false,
  onClick,
}: {
  label: string;
  icon: 'chevronUp' | 'chevronDown' | 'trash';
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-sm transition-colors disabled:opacity-25 disabled:hover:bg-transparent ${
        danger
          ? 'text-muted hover:bg-danger-50 hover:text-danger-500 dark:hover:bg-danger-900/40'
          : 'text-muted hover:bg-surface-3 hover:text-fg'
      }`}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
