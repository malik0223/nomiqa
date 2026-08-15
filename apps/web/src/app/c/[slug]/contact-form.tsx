'use client';

import type { CardContactForm, ContactFormFieldKey } from '@nomiqa/contracts';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitContactAction, type ContactFormState } from './contact-actions';

/**
 * نصوص النموذج.
 *
 * مضمَّنة لا من `next-intl`: هذه صفحة عامة بلا مزوّد ترجمة، وتحميل
 * المزوّد كاملاً لأجل عشرين كلمة يضيف إلى صفحة يُقاس نجاحها بـLCP —
 * نفس القرار المتخذ في `PublicCardActions`.
 */
const TEXT = {
  ar: {
    title: 'شارك بياناتك معي',
    fullName: 'الاسم الكامل',
    email: 'البريد الإلكتروني',
    phone: 'رقم الهاتف',
    organizationName: 'جهة العمل',
    jobTitle: 'المسمى الوظيفي',
    message: 'رسالة',
    optional: 'اختياري',
    consent: 'أوافق على حفظ بياناتي لدى صاحب البطاقة للتواصل معي.',
    marketing: 'أوافق على تلقي رسائل تعريفية لاحقاً.',
    submit: 'إرسال',
    sending: 'جارٍ الإرسال...',
    honeypot: 'اترك هذا الحقل فارغاً',
  },
  en: {
    title: 'Share your details',
    fullName: 'Full name',
    email: 'Email',
    phone: 'Phone number',
    organizationName: 'Organization',
    jobTitle: 'Job title',
    message: 'Message',
    optional: 'optional',
    consent: 'I agree to store my details with the card owner so they can contact me.',
    marketing: 'I agree to receive occasional updates.',
    submit: 'Send',
    sending: 'Sending...',
    honeypot: 'Leave this field empty',
  },
} as const;

const INPUT_TYPES: Record<ContactFormFieldKey, string> = {
  email: 'email',
  phone: 'tel',
  organizationName: 'text',
  jobTitle: 'text',
  message: 'text',
};

const FIELD_CLASS =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950';

export function ContactForm({
  slug,
  locale,
  form,
}: {
  slug: string;
  locale: string;
  form: CardContactForm;
}) {
  const text = locale === 'en' ? TEXT.en : TEXT.ar;
  const lang: 'ar' | 'en' = locale === 'en' ? 'en' : 'ar';

  const [state, action] = useActionState<ContactFormState, FormData>(
    submitContactAction.bind(null, slug, lang),
    { status: 'idle' },
  );

  if (state.status === 'sent') {
    // النموذج يختفي بعد النجاح: إبقاؤه يدعو إلى إرسال ثانٍ يصنع
    // جهة اتصال مكررة عند صاحب البطاقة.
    return (
      <section className="mx-auto w-full max-w-md px-5 pb-12">
        <p
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
        >
          {state.message}
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-md px-5 pb-12">
      <h2 className="mb-4 text-base font-semibold">{text.title}</h2>

      <form action={action} className="flex flex-col gap-3">
        {state.status === 'error' && state.message ? (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {state.message}
          </p>
        ) : null}

        <Field
          name="fullName"
          label={text.fullName}
          type="text"
          required
          error={state.fieldErrors?.fullName}
        />

        {form.fields.map((field) => (
          <Field
            key={field.key}
            name={field.key}
            label={text[field.key]}
            type={INPUT_TYPES[field.key]}
            required={field.required}
            optionalLabel={text.optional}
            multiline={field.key === 'message'}
            error={state.fieldErrors?.[field.key]}
          />
        ))}

        {form.customFields.map((field) => (
          <Field
            key={field.key}
            name={`custom.${field.key}`}
            label={(lang === 'en' ? field.labelEn : field.label) || field.label}
            type="text"
            required={field.required}
            optionalLabel={text.optional}
            error={state.fieldErrors?.[`customFields.${field.key}`]}
          />
        ))}

        {/*
          المصيدة: مخفية عن البشر وقارئات الشاشة، ظاهرة لروبوت يملأ كل
          حقل يجده. `display:none` لا `visibility` — بعض الروبوتات تتخطى
          الثاني. الفحص يقع في الخادم، فتعطيل السكربت لا يتجاوزها.
        */}
        <div hidden aria-hidden="true" style={{ display: 'none' }}>
          <label htmlFor="website">{text.honeypot}</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <Consent
          name="contactConsent"
          label={text.consent}
          required
          error={state.fieldErrors?.contactConsent}
        />
        <Consent name="marketingConsent" label={text.marketing} />

        <Submit label={text.submit} pendingLabel={text.sending} />
      </form>
    </section>
  );
}

function Field({
  name,
  label,
  type,
  required = false,
  optionalLabel,
  multiline = false,
  error,
}: {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  optionalLabel?: string;
  multiline?: boolean;
  error?: string;
}) {
  const id = `contact-${name}`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
        {!required && optionalLabel ? (
          <span className="ms-1 font-normal text-neutral-400">({optionalLabel})</span>
        ) : null}
      </label>

      {multiline ? (
        <textarea id={id} name={name} rows={3} required={required} className={FIELD_CLASS} />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          // الهاتف والبريد يُكتبان بالاتجاه اللاتيني حتى في نموذج عربي.
          dir={type === 'tel' || type === 'email' ? 'ltr' : undefined}
          className={FIELD_CLASS}
        />
      )}

      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

function Consent({
  name,
  label,
  required = false,
  error,
}: {
  name: string;
  label: string;
  required?: boolean;
  error?: string;
}) {
  const id = `contact-${name}`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-start gap-2 text-xs leading-6">
        <input
          id={id}
          name={name}
          type="checkbox"
          required={required}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <span className="text-neutral-700 dark:text-neutral-300">{label}</span>
      </label>

      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      data-track="contact-submit"
      className="mt-1 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
