'use server';

import { CONTACT_CONSENT_VERSION, type ApiErrorBody } from '@nomiqa/contracts';
import { contactSubmissionSchema } from '@nomiqa/validation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ContactFormState {
  status: 'idle' | 'sent' | 'error';
  message?: string;
  /** أخطاء الحقول مفهرسة باسم الحقل — تُعرض تحت كل حقل لا في رأس النموذج. */
  fieldErrors?: Record<string, string>;
}

const TEXT = {
  ar: {
    generic: 'تعذّر إرسال بياناتك. حاول مرة أخرى.',
    sent: 'وصلت بياناتك. شكراً لك.',
    consent: 'الموافقة على حفظ بياناتك مطلوبة',
  },
  en: {
    generic: 'We could not send your details. Please try again.',
    sent: 'Your details were received. Thank you.',
    consent: 'Consent to store your details is required',
  },
} as const;

/**
 * إرسال نموذج «شارك بياناتك معي».
 *
 * إجراء خادمي لا استدعاء من المتصفح، لسببين:
 *
 *  1. **يعمل بلا JavaScript.** الصفحة العامة تُفتح على هواتف وشبكات
 *     رديئة، والنموذج هو نقطة التحويل الوحيدة فيها. نموذج لا يُرسل
 *     لأن حزمة JS لم تصل يفقد بالضبط ما بُنيت الصفحة لأجله.
 *  2. **المصيدة تبقى خادمية.** حقل `website` يُقرأ هنا ويُمرَّر إلى
 *     الـAPI؛ لو فُحص في المتصفح لأمكن تجاوزه بتعطيل السكربت.
 *
 * لا يُمرَّر شيء عن الزائر عدا ما كتبه: عنوانه وUser-Agent يراهما
 * الـAPI من الطلب نفسه ويستخدمهما للإثبات القانوني وحده.
 */
export async function submitContactAction(
  slug: string,
  locale: 'ar' | 'en',
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const text = TEXT[locale] ?? TEXT.ar;

  const customFields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('custom.') && typeof value === 'string') {
      customFields[key.slice('custom.'.length)] = value;
    }
  }

  const parsed = contactSubmissionSchema.safeParse({
    fullName: str(formData.get('fullName')) ?? '',
    email: str(formData.get('email')),
    phone: str(formData.get('phone')),
    organizationName: str(formData.get('organizationName')),
    jobTitle: str(formData.get('jobTitle')),
    message: str(formData.get('message')),
    customFields,
    locale,
    // القيمة الحرفية `true` هي ما يقبله المخطط؛ مربع غير مؤشَّر يصل
    // `null` فيُرفض برسالة الموافقة لا برسالة نوع.
    contactConsent: formData.get('contactConsent') === 'on' ? true : undefined,
    marketingConsent: formData.get('marketingConsent') === 'on',
    consentTextVersion: CONTACT_CONSENT_VERSION,
    website: str(formData.get('website')) ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.') || 'form';
      fieldErrors[field] ??= field === 'contactConsent' ? text.consent : issue.message;
    }

    return { status: 'error', message: text.generic, fieldErrors };
  }

  try {
    const response = await fetch(
      `${API_URL}/api/v1/public/cards/${encodeURIComponent(slug)}/contact`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      const fieldErrors: Record<string, string> = {};
      for (const detail of body?.error?.details ?? []) {
        fieldErrors[detail.field] ??= detail.message;
      }

      return {
        status: 'error',
        message: body?.error?.message ?? text.generic,
        ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
      };
    }

    return { status: 'sent', message: text.sent };
  } catch {
    return { status: 'error', message: text.generic };
  }
}

/** حقل نصي فارغ يعني «لم يُملأ» لا سلسلة فارغة تُخزَّن. */
function str(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
