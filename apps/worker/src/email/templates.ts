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

  // رسالة الشكر تذهب إلى **زائر ليس مستخدماً في المنصة**، ولذلك:
  //  - لا رابط إلى لوحة تحكم ولا دعوة لإنشاء حساب: هي تأكيد استلام لا
  //    قناة تسويق، والزائر وافق على حفظ بياناته لا على مراسلته.
  //  - لا تُرسل إلا لمن ترك بريده — راجع dispatcher.ts.
  [EMAIL_TEMPLATES.CONTACT_THANK_YOU]: {
    ar: (v) => {
      const owner = escapeHtml(v.ownerName ?? '');
      const withOwner = owner.length > 0 ? ` مع ${owner}` : '';
      return {
        subject: 'شكراً لمشاركة بياناتك',
        html: layout(
          'ar',
          'شكراً لمشاركة بياناتك',
          `<h1 style="font-size:20px;margin:0 0 16px;">شكراً ${escapeHtml(v.contactName ?? '')}</h1>
           <p style="line-height:1.7;color:#374151;">وصلت بياناتك${withOwner}. سيتم التواصل معك قريباً.</p>`,
        ),
        text: `شكراً ${v.contactName ?? ''}\n\nوصلت بياناتك${v.ownerName ? ` مع ${v.ownerName}` : ''}. سيتم التواصل معك قريباً.`,
      };
    },
    en: (v) => {
      const owner = escapeHtml(v.ownerName ?? '');
      const withOwner = owner.length > 0 ? ` with ${owner}` : '';
      return {
        subject: 'Thanks for sharing your details',
        html: layout(
          'en',
          'Thanks for sharing your details',
          `<h1 style="font-size:20px;margin:0 0 16px;">Thank you ${escapeHtml(v.contactName ?? '')}</h1>
           <p style="line-height:1.7;color:#374151;">Your details were shared${withOwner}. You will be contacted soon.</p>`,
        ),
        text: `Thank you ${v.contactName ?? ''}\n\nYour details were shared${v.ownerName ? ` with ${v.ownerName}` : ''}. You will be contacted soon.`,
      };
    },
  },

  // ---------- المرحلة 4: الموافقات ----------

  [EMAIL_TEMPLATES.CHANGE_REQUEST_SUBMITTED]: {
    ar: (v) => ({
      subject: 'طلب تعديل بطاقة ينتظر مراجعتك',
      html: layout(
        'ar',
        'طلب تعديل جديد',
        `<h1 style="font-size:20px;margin:0 0 16px;">طلب تعديل ينتظر مراجعتك</h1>
         <p style="line-height:1.7;color:#374151;">${escapeHtml(v.requesterName ?? 'أحد الموظفين')} طلب تعديل حقول: ${escapeHtml(v.fields ?? '')}.</p>
         ${button(v.reviewUrl, 'مراجعة الطلب')}`,
      ),
      text: `${v.requesterName ?? 'أحد الموظفين'} طلب تعديل حقول: ${v.fields ?? ''}\n\n${v.reviewUrl ?? ''}`,
    }),
    en: (v) => ({
      subject: 'A card change request needs your review',
      html: layout(
        'en',
        'New change request',
        `<h1 style="font-size:20px;margin:0 0 16px;">A change request needs your review</h1>
         <p style="line-height:1.7;color:#374151;">${escapeHtml(v.requesterName ?? 'An employee')} requested changes to: ${escapeHtml(v.fields ?? '')}.</p>
         ${button(v.reviewUrl, 'Review request')}`,
      ),
      text: `${v.requesterName ?? 'An employee'} requested changes to: ${v.fields ?? ''}\n\n${v.reviewUrl ?? ''}`,
    }),
  },

  [EMAIL_TEMPLATES.CHANGE_REQUEST_REVIEWED]: {
    ar: (v) => {
      const approved = v.status === 'approved';
      return {
        subject: approved ? 'وُوفق على طلب التعديل' : 'لم يُقبل طلب التعديل',
        html: layout(
          'ar',
          'نتيجة طلب التعديل',
          `<h1 style="font-size:20px;margin:0 0 16px;">${approved ? 'وُوفق على طلبك' : 'لم يُقبل طلبك'}</h1>
           ${v.note ? `<p style="line-height:1.7;color:#374151;">ملاحظة المراجع: ${escapeHtml(v.note)}</p>` : ''}
           ${button(v.cardUrl, 'فتح البطاقة')}`,
        ),
        text: `${approved ? 'وُوفق على طلبك' : 'لم يُقبل طلبك'}${v.note ? `\n\nملاحظة: ${v.note}` : ''}`,
      };
    },
    en: (v) => {
      const approved = v.status === 'approved';
      return {
        subject: approved ? 'Your change request was approved' : 'Your change request was declined',
        html: layout(
          'en',
          'Change request result',
          `<h1 style="font-size:20px;margin:0 0 16px;">${approved ? 'Your request was approved' : 'Your request was declined'}</h1>
           ${v.note ? `<p style="line-height:1.7;color:#374151;">Reviewer note: ${escapeHtml(v.note)}</p>` : ''}
           ${button(v.cardUrl, 'Open card')}`,
        ),
        text: `${approved ? 'Your request was approved' : 'Your request was declined'}${v.note ? `\n\nNote: ${v.note}` : ''}`,
      };
    },
  },

  // ---------- المرحلة 4: الفوترة ----------

  [EMAIL_TEMPLATES.INVOICE_ISSUED]: {
    ar: (v) => ({
      subject: `فاتورة ${v.number ?? ''} — ${v.amount ?? ''} ر.ع`,
      html: layout(
        'ar',
        'فاتورة جديدة',
        `<h1 style="font-size:20px;margin:0 0 16px;">فاتورة ${escapeHtml(v.number ?? '')}</h1>
         <p style="line-height:1.7;color:#374151;">المستحق ${escapeHtml(v.amount ?? '')} ريال عُماني، وتاريخ الاستحقاق ${escapeHtml(v.dueAt ?? '')}.</p>
         ${button(v.payUrl, 'سداد الفاتورة')}`,
      ),
      text: `فاتورة ${v.number ?? ''}: ${v.amount ?? ''} ر.ع، تستحق في ${v.dueAt ?? ''}\n\n${v.payUrl ?? ''}`,
    }),
    en: (v) => ({
      subject: `Invoice ${v.number ?? ''} — OMR ${v.amount ?? ''}`,
      html: layout(
        'en',
        'New invoice',
        `<h1 style="font-size:20px;margin:0 0 16px;">Invoice ${escapeHtml(v.number ?? '')}</h1>
         <p style="line-height:1.7;color:#374151;">Amount due: OMR ${escapeHtml(v.amount ?? '')}, due on ${escapeHtml(v.dueAt ?? '')}.</p>
         ${button(v.payUrl, 'Pay invoice')}`,
      ),
      text: `Invoice ${v.number ?? ''}: OMR ${v.amount ?? ''}, due ${v.dueAt ?? ''}\n\n${v.payUrl ?? ''}`,
    }),
  },

  [EMAIL_TEMPLATES.INVOICE_PAID]: {
    ar: (v) => ({
      subject: `إيصال سداد الفاتورة ${v.number ?? ''}`,
      html: layout(
        'ar',
        'إيصال سداد',
        `<h1 style="font-size:20px;margin:0 0 16px;">وصلنا سدادك</h1>
         <p style="line-height:1.7;color:#374151;">الفاتورة ${escapeHtml(v.number ?? '')} بمبلغ ${escapeHtml(v.amount ?? '')} ريال عُماني مسدَّدة.</p>
         ${button(v.invoiceUrl, 'عرض الفاتورة')}`,
      ),
      text: `الفاتورة ${v.number ?? ''} بمبلغ ${v.amount ?? ''} ر.ع مسدَّدة.\n\n${v.invoiceUrl ?? ''}`,
    }),
    en: (v) => ({
      subject: `Receipt for invoice ${v.number ?? ''}`,
      html: layout(
        'en',
        'Payment receipt',
        `<h1 style="font-size:20px;margin:0 0 16px;">Payment received</h1>
         <p style="line-height:1.7;color:#374151;">Invoice ${escapeHtml(v.number ?? '')} for OMR ${escapeHtml(v.amount ?? '')} is paid.</p>
         ${button(v.invoiceUrl, 'View invoice')}`,
      ),
      text: `Invoice ${v.number ?? ''} for OMR ${v.amount ?? ''} is paid.\n\n${v.invoiceUrl ?? ''}`,
    }),
  },

  [EMAIL_TEMPLATES.PAYMENT_FAILED]: {
    ar: (v) => ({
      subject: 'تعذّر تحصيل اشتراكك',
      html: layout(
        'ar',
        'تعذّر التحصيل',
        `<h1 style="font-size:20px;margin:0 0 16px;">تعذّر تحصيل اشتراكك</h1>
         <p style="line-height:1.7;color:#374151;">خدمتك تعمل كالمعتاد حتى ${escapeHtml(v.graceEndsAt ?? '')}. سدّد قبل ذلك التاريخ لتفادي خفض الباقة.</p>
         ${button(v.payUrl, 'سداد الآن')}`,
      ),
      text: `تعذّر تحصيل اشتراكك. خدمتك تعمل حتى ${v.graceEndsAt ?? ''}.\n\n${v.payUrl ?? ''}`,
    }),
    en: (v) => ({
      subject: 'We could not collect your subscription payment',
      html: layout(
        'en',
        'Payment failed',
        `<h1 style="font-size:20px;margin:0 0 16px;">We could not collect your payment</h1>
         <p style="line-height:1.7;color:#374151;">Your service continues until ${escapeHtml(v.graceEndsAt ?? '')}. Pay before then to avoid a downgrade.</p>
         ${button(v.payUrl, 'Pay now')}`,
      ),
      text: `We could not collect your payment. Service continues until ${v.graceEndsAt ?? ''}.\n\n${v.payUrl ?? ''}`,
    }),
  },

  [EMAIL_TEMPLATES.ORGANIZATION_SUSPENDED]: {
    ar: (v) => ({
      subject: 'تعليق حساب مؤسستك',
      html: layout(
        'ar',
        'تعليق الحساب',
        `<h1 style="font-size:20px;margin:0 0 16px;">عُلِّق حساب مؤسستك</h1>
         <p style="line-height:1.7;color:#374151;">السبب: ${escapeHtml(v.reason ?? '')}</p>
         <p style="line-height:1.7;color:#374151;">بياناتك محفوظة وقابلة للتصدير. للاعتراض أو الاستفسار افتح تذكرة دعم.</p>
         ${button(v.supportUrl, 'فتح تذكرة دعم')}`,
      ),
      text: `عُلِّق حساب مؤسستك. السبب: ${v.reason ?? ''}\n\n${v.supportUrl ?? ''}`,
    }),
    en: (v) => ({
      subject: 'Your organization account is suspended',
      html: layout(
        'en',
        'Account suspended',
        `<h1 style="font-size:20px;margin:0 0 16px;">Your organization account is suspended</h1>
         <p style="line-height:1.7;color:#374151;">Reason: ${escapeHtml(v.reason ?? '')}</p>
         <p style="line-height:1.7;color:#374151;">Your data is retained and exportable. Open a support ticket to appeal.</p>
         ${button(v.supportUrl, 'Open a support ticket')}`,
      ),
      text: `Your organization account is suspended. Reason: ${v.reason ?? ''}\n\n${v.supportUrl ?? ''}`,
    }),
  },

  /**
   * تقرير ما بعد الفعالية (§11.3).
   *
   * الأرقام في نص الرسالة لا خلف رابط: من يقرأها على هاتفه مساء آخر
   * يوم معرض يريد أن يعرف كم عميلاً جُمع، لا أن يسجّل دخوله ليعرف.
   * والرابط يبقى لمن يريد التفصيل ومقارنة أداء الفريق.
   */
  [EMAIL_TEMPLATES.EVENT_REPORT]: {
    ar: (v) => ({
      subject: `تقرير فعالية ${v.eventName ?? ''}`,
      html: layout(
        'ar',
        'تقرير الفعالية',
        `<h1 style="font-size:20px;margin:0 0 16px;">انتهت ${escapeHtml(v.eventName ?? '')}</h1>
         <p style="line-height:1.7;color:#374151;">عدد العملاء المحتملين: <strong>${escapeHtml(v.leads ?? '0')}</strong></p>
         <p style="line-height:1.7;color:#374151;">المؤهَّلون منهم: <strong>${escapeHtml(v.qualifiedLeads ?? '0')}</strong></p>
         ${button(v.reportUrl, 'فتح التقرير الكامل')}`,
      ),
      text: `انتهت ${v.eventName ?? ''}. العملاء المحتملون: ${v.leads ?? '0'}\n\n${v.reportUrl ?? ''}`,
    }),
    en: (v) => ({
      subject: `Event report: ${v.eventName ?? ''}`,
      html: layout(
        'en',
        'Event report',
        `<h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(v.eventName ?? '')} has ended</h1>
         <p style="line-height:1.7;color:#374151;">Leads captured: <strong>${escapeHtml(v.leads ?? '0')}</strong></p>
         <p style="line-height:1.7;color:#374151;">Qualified: <strong>${escapeHtml(v.qualifiedLeads ?? '0')}</strong></p>
         ${button(v.reportUrl, 'Open the full report')}`,
      ),
      text: `${v.eventName ?? ''} has ended. Leads captured: ${v.leads ?? '0'}\n\n${v.reportUrl ?? ''}`,
    }),
  },
};

/**
 * زر إجراء.
 *
 * يُحذف كلياً حين لا يوجد رابط بدل الإبقاء على `#`: زر لا يذهب إلى
 * مكان أسوأ من غياب الزر، وهو ما كان يفعله `?? '#'` في القوالب الأقدم.
 */
function button(url: string | undefined, label: string): string {
  if (!url) {
    return '';
  }

  return `<p><a href="${encodeURI(url)}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">${escapeHtml(label)}</a></p>`;
}

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
