'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * صندوق المشاركة في المحرر.
 *
 * الرابط ورمز QR يشيران إلى المسار الثابت (`/<slug>`) لا إلى نسخة
 * بعينها: تحديث البطاقة **لا يستدعي إعادة إصدار QR** — وهي بوابة خروج
 * صريحة من المرحلة 2.
 */
export function ShareBox({ publicUrl, slug }: { publicUrl: string; slug: string }) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  return (
    <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">{t('cards.share.title')}</h2>

      <div className="mt-3 flex items-center gap-3">
        {/* SVG يُولَّد على الخادم ولا يستفيد من محسّن الصور. */}
        <img
          src={`/c/${slug}/qr`}
          alt={t('cards.share.qrAlt')}
          width={96}
          height={96}
          className="h-24 w-24 rounded-lg bg-white p-1 ring-1 ring-neutral-200 dark:ring-neutral-700"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-neutral-500" dir="ltr">
            {publicUrl}
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(publicUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
            >
              {copied ? t('cards.share.copied') : t('cards.share.copy')}
            </button>

            <a
              href={`/c/${slug}/qr?format=png&size=1024`}
              download={`${slug}-qr.png`}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
            >
              {t('cards.share.downloadQr')}
            </a>

            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              {t('cards.share.open')}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
