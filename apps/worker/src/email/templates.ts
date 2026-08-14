import { EMAIL_TEMPLATES, type EmailTemplate } from '@nomiqa/contracts';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

type Variables = Record<string, string>;
type Renderer = (variables: Variables) => RenderedEmail;

/** يهرّب المحارف الخاصة — متغيرات القالب تأتي من مدخلات مستخدمين. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * غلاف الرسالة. الاتجاه واللغة يُضبطان على عنصر html نفسه حتى تعرض
 * عملاء البريد النص العربي بصورة صحيحة — كثير منها لا يطبّق CSS.
 */
function layout(locale: 'ar' | 'en', title: string, bodyHtml: string): string {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const fontStack =
    locale === 'ar'
      ? "'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif"
      : "'Segoe UI', Helvetica, Arial, sans-serif";

  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
  <head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:${fontStack};">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px;">
      <p style="color:#6b7280;font-size:12px;margin:0;">Nomiqa</p>
    </div>
  </body>
</html>`;
}

const renderers: Record<EmailTemplate, Record<'ar' | 'en', Renderer>> = {
  [EMAIL_TEMPLATES.WELCOME]: {
    ar: (v) => {
      const name = escapeHtml(v.name ?? '');
      return {
        subject: 'مرحباً بك في نمِقة',
        html: layout(
          'ar',
          'مرحباً بك في نمِقة',
          `<h1 style="font-size:20px;margin:0 0 16px;">مرحباً ${name}</h1>
           <p style="line-height:1.7;color:#374151;">أنشئ بطاقتك المهنية الرقمية وشاركها بلمسة واحدة.</p>`,
        ),
        text: `مرحباً ${v.name ?? ''}\n\nأنشئ بطاقتك المهنية الرقمية وشاركها بلمسة واحدة.`,
      };
    },
    en: (v) => {
      const name = escapeHtml(v.name ?? '');
      return {
        subject: 'Welcome to Nomiqa',
        html: layout(
          'en',
          'Welcome to Nomiqa',
          `<h1 style="font-size:20px;margin:0 0 16px;">Welcome ${name}</h1>
           <p style="line-height:1.7;color:#374151;">Create your digital business card and share it with a single tap.</p>`,
        ),
        text: `Welcome ${v.name ?? ''}\n\nCreate your digital business card and share it with a single tap.`,
      };
    },
  },

  [EMAIL_TEMPLATES.ORGANIZATION_INVITE]: {
    ar: (v) => ({
      subject: `دعوة للانضمام إلى ${v.organizationName ?? ''}`,
      html: layout(
        'ar',
        'دعوة للانضمام',
        `<h1 style="font-size:20px;margin:0 0 16px;">دعوة للانضمام</h1>
         <p style="line-height:1.7;color:#374151;">دُعيت للانضمام إلى ${escapeHtml(v.organizationName ?? '')}.</p>
         <p><a href="${encodeURI(v.inviteUrl ?? '#')}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">قبول الدعوة</a></p>`,
      ),
      text: `دُعيت للانضمام إلى ${v.organizationName ?? ''}\n\n${v.inviteUrl ?? ''}`,
    }),
    en: (v) => ({
      subject: `Invitation to join ${v.organizationName ?? ''}`,
      html: layout(
        'en',
        'Invitation to join',
        `<h1 style="font-size:20px;margin:0 0 16px;">You have been invited</h1>
         <p style="line-height:1.7;color:#374151;">You have been invited to join ${escapeHtml(v.organizationName ?? '')}.</p>
         <p><a href="${encodeURI(v.inviteUrl ?? '#')}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">Accept invitation</a></p>`,
      ),
      text: `You have been invited to join ${v.organizationName ?? ''}\n\n${v.inviteUrl ?? ''}`,
    }),
  },

  [EMAIL_TEMPLATES.CONTACT_CAPTURED]: {
    ar: (v) => ({
      subject: 'جهة اتصال جديدة',
      html: layout(
        'ar',
        'جهة اتصال جديدة',
        `<h1 style="font-size:20px;margin:0 0 16px;">وصلتك جهة اتصال جديدة</h1>
         <p style="line-height:1.7;color:#374151;">${escapeHtml(v.contactName ?? 'شخص ما')} شارك بياناته معك.</p>`,
      ),
      text: `${v.contactName ?? 'شخص ما'} شارك بياناته معك.`,
    }),
    en: (v) => ({
      subject: 'New contact',
      html: layout(
        'en',
        'New contact',
        `<h1 style="font-size:20px;margin:0 0 16px;">You received a new contact</h1>
         <p style="line-height:1.7;color:#374151;">${escapeHtml(v.contactName ?? 'Someone')} shared their details with you.</p>`,
      ),
      text: `${v.contactName ?? 'Someone'} shared their details with you.`,
    }),
  },
};

export function renderEmail(
  template: EmailTemplate,
  locale: 'ar' | 'en',
  variables: Record<string, string>,
): RenderedEmail {
  const byLocale = renderers[template];
  if (!byLocale) {
    throw new Error(`قالب بريد غير معروف: ${template}`);
  }

  // العربية هي الافتراضية عند غياب ترجمة، فلا تفشل الرسالة لأجل اللغة.
  const render = byLocale[locale] ?? byLocale.ar;
  return render(variables);
}
