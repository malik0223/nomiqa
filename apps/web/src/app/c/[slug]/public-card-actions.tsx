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

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-5 pb-12">
      <a
        href={`/c/${slug}/vcard?lang=${locale}`}
        // download يجعل الهاتف يفتح بطاقة الاتصال بدل عرض النص.
        download={`${slug}.vcf`}
        className="block rounded-xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        {text.save}
      </a>

      <div className="flex flex-wrap justify-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => void share()}
          className="rounded-lg px-3 py-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
        >
          {text.share}
        </button>

        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${shareText} — ${publicUrl}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg px-3 py-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
        >
          {text.whatsapp}
        </a>

        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-lg px-3 py-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
        >
          {copied ? text.copied : text.copy}
        </button>

        {otherLocale ? (
          // رابط لا زر: يعمل بلا JavaScript ويُفهرَس كنسخة ثانية للصفحة.
          <a
            href={`?lang=${otherLocale}`}
            className="rounded-lg px-3 py-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
          >
            {text.switch}
          </a>
        ) : null}
      </div>
    </div>
  );
}
