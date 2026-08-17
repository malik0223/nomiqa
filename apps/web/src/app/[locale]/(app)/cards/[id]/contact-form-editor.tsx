'use client';

import { CONTACT_FORM_FIELDS, type ContactFormFieldKey } from '@nomiqa/contracts';
import { Alert, Button, Input, Panel, PanelHeader, SectionLabel } from '@nomiqa/ui';
import { useTranslations } from 'next-intl';
import type { UseFormSetValue, UseFormRegister } from 'react-hook-form';
import type { CardFormValues } from './form-types';

/** يطابق الحد في `cardContactFormSchema` — الواجهة تمنع قبل أن يرفض الـAPI. */
const MAX_CUSTOM_FIELDS = 3;

/**
 * إعداد نموذج «شارك بياناتك معي».
 *
 * قاعدة الواجهة هنا مقصودة: النموذج **معطَّل افتراضياً**. جمع بيانات
 * أطراف ثالثة قرار يتخذه صاحب البطاقة صراحةً، لا إعداد يجده مفعَّلاً
 * فيجمع بيانات لم ينتبه أنه يجمعها.
 */
export function ContactFormEditor({
  values,
  register,
  setValue,
}: {
  values: CardFormValues['contactForm'];
  register: UseFormRegister<CardFormValues>;
  setValue: UseFormSetValue<CardFormValues>;
}) {
  const t = useTranslations();

  const enabledKeys = CONTACT_FORM_FIELDS.filter((key) => values.fields[key]?.enabled);
  // الشرط نفسه المفروض في الـAPI: بلا بريد ولا هاتف تصير جهة الاتصال
  // اسماً لا سبيل للرد عليه.
  const missingChannel =
    values.enabled && !enabledKeys.includes('email') && !enabledKeys.includes('phone');

  const addCustomField = () => {
    if (values.customFields.length >= MAX_CUSTOM_FIELDS) return;

    setValue(
      'contactForm.customFields',
      [
        ...values.customFields,
        // مفتاح مشتق من الموضع: ثابت بعد الإنشاء، فلا تنفصل القيم
        // المحفوظة عن حقولها حين يُحذف حقل قبله.
        { key: `field_${Date.now().toString(36)}`, label: '', labelEn: '', required: false },
      ],
      { shouldDirty: true },
    );
  };

  const removeCustomField = (index: number) => {
    setValue(
      'contactForm.customFields',
      values.customFields.filter((_, position) => position !== index),
      { shouldDirty: true },
    );
  };

  return (
    <Panel>
      <PanelHeader
        icon="contacts"
        title={t('cards.contactForm.title')}
        description={t('cards.contactForm.hint')}
      />

      <label className="mt-5 flex cursor-pointer items-center gap-2.5 rounded-md border border-line bg-surface-2 px-4 py-3 text-[0.8125rem] font-medium transition-colors hover:border-line-strong has-checked:border-accent-line/60 has-checked:bg-accent-soft/40">
        <input type="checkbox" {...register('contactForm.enabled')} className="h-4 w-4 accent-primary" />
        {t('cards.contactForm.enable')}
      </label>

      {values.enabled ? (
        <>
          <SectionLabel className="mt-7">{t('cards.contactForm.fields')}</SectionLabel>

          <ul className="mt-3 flex flex-col divide-y divide-line">
            {CONTACT_FORM_FIELDS.map((key: ContactFormFieldKey) => (
              <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <label className="flex cursor-pointer items-center gap-2.5 text-[0.8125rem]">
                  <input
                    type="checkbox"
                    {...register(`contactForm.fields.${key}.enabled`)}
                    className="h-4 w-4 accent-primary"
                  />
                  {t(`cards.contactForm.field.${key}`)}
                </label>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    disabled={!values.fields[key]?.enabled}
                    {...register(`contactForm.fields.${key}.required`)}
                    className="h-4 w-4 accent-primary"
                  />
                  {t('cards.contactForm.required')}
                </label>
              </li>
            ))}
          </ul>

          {missingChannel ? (
            <Alert tone="warning" className="mt-4">
              {t('cards.contactForm.needsChannel')}
            </Alert>
          ) : null}

          <SectionLabel className="mt-7">{t('cards.contactForm.customFields')}</SectionLabel>

          <ul className="mt-3 flex flex-col gap-2.5">
            {values.customFields.map((field, index) => (
              <li key={field.key} className="flex flex-wrap items-center gap-2">
                <Input
                  type="text"
                  placeholder={t('cards.contactForm.customLabel')}
                  aria-label={t('cards.contactForm.customLabel')}
                  {...register(`contactForm.customFields.${index}.label`)}
                  className="min-w-40 flex-1"
                />
                <Input
                  type="text"
                  dir="ltr"
                  placeholder={t('cards.contactForm.customLabelEn')}
                  aria-label={t('cards.contactForm.customLabelEn')}
                  {...register(`contactForm.customFields.${index}.labelEn`)}
                  className="min-w-40 flex-1"
                />
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    {...register(`contactForm.customFields.${index}.required`)}
                    className="h-4 w-4 accent-primary"
                  />
                  {t('cards.contactForm.required')}
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  aria-label={t('cards.contactForm.removeField')}
                  onClick={() => removeCustomField(index)}
                />
              </li>
            ))}
          </ul>

          {values.customFields.length < MAX_CUSTOM_FIELDS ? (
            <Button size="sm" icon="plus" className="mt-3" onClick={addCustomField}>
              {t('cards.contactForm.addField')}
            </Button>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
