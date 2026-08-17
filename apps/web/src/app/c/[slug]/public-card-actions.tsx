'use client';

import { useState } from 'react';

const TEXT = {
  ar: {
    save: 'حفظ جهة الاتصال',
    share: 'مشاركة',
    whatsapp: 'واتساب',
    copy: 'نسخ الرابط',
    copied: 'نُسخ الرابط',
    switch: 'English',
    shareText: 'بطاقة {name}',
  },
  en: {
    save: 'Save contact',
    share: 'Share',
    whatsapp: 'WhatsApp',
    copy: 'Copy link',
    copied: 'Link copied',
    switch: 'العربية',
    shareText: "{name}'s card",
  },
} as const;

/**
 * أزرار الزائر.
 *
 * المكوّن العميل **الوحيد** في الصفحة العامة، وحجمه مقصود: النسخ
 * والمشاركة الأصلية يحتاجان المتصفح، وكل ما عداهما — البطاقة نفسها،
 * الروابط، vCard، رمز QR — يُقدَّم من الخادم بلا JavaScript (§7.6).
 *
 * لا نصوص من `next-intl` هنا: تحميل مزوّد الترجمة كاملاً لأجل ست
 * كلمات يضيف إلى صفحة يُقاس نجاحها بـLCP دون 2.5 ثانية.
 */
export function PublicCardActions({
  slug,
  publicUrl,
  locale,
  otherLocale,
  name,
}: {
  slug: string;
  publicUrl: string;
  locale: string;
  otherLocale: string | null;
  name: string;
}) {
  const text = locale === 'en' ? TEXT.en : TEXT.ar;
  const [copied, setCopied] = useState(false);

  const shareText = text.shareText.replace('{name}', name);

  async function share() {
    // المشاركة الأصلية على الهاتف تفتح كل التطبيقات المثبّتة دفعة
    // واحدة؛ حين لا تتوفر نعود إلى النسخ بدل تعطيل الزر.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: shareText, url: publicUrl });
        return;
      } catch {
        // ألغى المستخدم المشاركة — ليس خطأً.
        return;
      }
    }

    await copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // بعض المتصفحات تمنع الحافظة خارج سياق آمن — الرابط ظاهر أصلاً.
    }
  }

  const quiet =
    'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100';

  return (
    <div className="mt-4 flex w-full flex-col gap-3">
      {/*
        «حفظ جهة الاتصال» هو الفعل الذي تُقاس به البطاقة، فهو الوحيد
        بمظهر زرّ ممتلئ عريض. البقية أفعال ثانوية بلا حدود.
      */}
      <a
        href={`/c/${slug}/vcard?lang=${locale}`}
        // download يجعل الهاتف يفتح بطاقة الاتصال بدل عرض النص.
        download={`${slug}.vcf`}
        // يلتقطه المستمع المفوَّض في AnalyticsBeacon.
        data-track="vcard"
        className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 py-3.5 text-center text-sm font-semibold shadow-sheet transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800"
      >
        <DownloadGlyph />
        {text.save}
      </a>

      <div className="flex flex-wrap items-center justify-center gap-1 text-[0.8125rem]">
        <button type="button" onClick={() => void share()} className={quiet}>
          {text.share}
        </button>

        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${shareText} — ${publicUrl}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={quiet}
        >
          {text.whatsapp}
        </a>

        <button type="button" onClick={() => void copy()} className={quiet}>
          {copied ? text.copied : text.copy}
        </button>

        {otherLocale ? (
          // رابط لا زر: يعمل بلا JavaScript ويُفهرَس كنسخة ثانية للصفحة.
          <a href={`?lang=${otherLocale}`} className={quiet}>
            {text.switch}
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** أيقونة مرسومة هنا لا مستوردة: الصفحة العامة تُقاس بحجمها. */
function DownloadGlyph() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16" />
    </svg>
  );
}
