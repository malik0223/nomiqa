'use client';

import { CONTACT_FORM_FIELDS, type ContactFormFieldKey } from '@nomiqa/contracts';
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
    <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="text-lg font-semibold">{t('cards.contactForm.title')}</h2>
      <p className="mt-1 text-sm text-neutral-500">{t('cards.contactForm.hint')}</p>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('contactForm.enabled')} className="h-4 w-4" />
        {t('cards.contactForm.enable')}
      </label>

      {values.enabled ? (
        <>
          <p className="mt-5 text-xs font-medium text-neutral-500">
            {t('cards.contactForm.fields')}
          </p>

          <ul className="mt-2 space-y-2">
            {CONTACT_FORM_FIELDS.map((key: ContactFormFieldKey) => (
              <li key={key} className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex min-w-40 items-center gap-2">
                  <input
                    type="checkbox"
                    {...register(`contactForm.fields.${key}.enabled`)}
                    className="h-4 w-4"
                  />
                  {t(`cards.contactForm.field.${key}`)}
                </label>

                <label className="flex items-center gap-2 text-xs text-neutral-500">
                  <input
                    type="checkbox"
                    disabled={!values.fields[key]?.enabled}
                    {...register(`contactForm.fields.${key}.required`)}
                    className="h-4 w-4"
                  />
                  {t('cards.contactForm.required')}
                </label>
              </li>
            ))}
          </ul>

          {missingChannel ? (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              {t('cards.contactForm.needsChannel')}
            </p>
          ) : null}

          <p className="mt-6 text-xs font-medium text-neutral-500">
            {t('cards.contactForm.customFields')}
          </p>

          <ul className="mt-2 space-y-3">
            {values.customFields.map((field, index) => (
              <li key={field.key} className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder={t('cards.contactForm.customLabel')}
                  aria-label={t('cards.contactForm.customLabel')}
                  {...register(`contactForm.customFields.${index}.label`)}
                  className="min-w-40 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                />
                <input
                  type="text"
                  dir="ltr"
                  placeholder={t('cards.contactForm.customLabelEn')}
                  aria-label={t('cards.contactForm.customLabelEn')}
                  {...register(`contactForm.customFields.${index}.labelEn`)}
                  className="min-w-40 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                />
                <label className="flex items-center gap-2 text-xs text-neutral-500">
                  <input
                    type="checkbox"
                    {...register(`contactForm.customFields.${index}.required`)}
                    className="h-4 w-4"
                  />
                  {t('cards.contactForm.required')}
                </label>
                <button
                  type="button"
                  onClick={() => removeCustomField(index)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  {t('cards.contactForm.removeField')}
                </button>
              </li>
            ))}
          </ul>

          {values.customFields.length < MAX_CUSTOM_FIELDS ? (
            <button
              type="button"
              onClick={addCustomField}
              className="mt-3 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              {t('cards.contactForm.addField')}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
