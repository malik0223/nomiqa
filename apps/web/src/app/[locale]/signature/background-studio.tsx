'use client';

import { MEETING_PLATFORMS, type MeetingPlatform } from '@nomiqa/contracts';
import { useEffect, useRef, useState, useTransition } from 'react';
import { generateBackgroundAction } from './actions';

interface Labels {
  platform: string;
  scheme: string;
  light: string;
  dark: string;
  showQr: string;
  generate: string;
  download: string;
  hint: string;
  platformNames: Record<string, string>;
}

/**
 * خلفيات الاجتماعات (§10.3).
 *
 * الخلفية تصل كـSVG وتُحوَّل إلى PNG **في المتصفح**: منصات الاجتماعات
 * لا تقبل SVG، والتنقيط في الخادم كان يستدعي مكتبة معالجة صور لأجل
 * ملف يُنزَّل مرة كل بضعة أشهر.
 *
 * التحويل عبر `canvas` من `blob:` لا من `data:`: السماح للصورة بأن
 * تأتي من عنوان بيانات طويل يصطدم بحدود الطول في بعض المتصفحات، وحجم
 * الخلفية بالكامل يمر في العنوان.
 */
export function BackgroundStudio({ cardId, locale, labels }: {
  cardId: string;
  locale: string;
  labels: Labels;
}) {
  const [platform, setPlatform] = useState<MeetingPlatform>('zoom');
  const [scheme, setScheme] = useState<'light' | 'dark'>('dark');
  const [showQr, setShowQr] = useState(true);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  function generate(): void {
    setError(null);

    startTransition(async () => {
      const result = await generateBackgroundAction({
        cardId,
        platform,
        locale,
        scheme,
        showQr,
      });

      if (result.ok && result.background) setSvg(result.background.svg);
      else setError(result.message ?? null);
    });
  }

  async function download(): Promise<void> {
    if (!svg) return;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('image'));
        image.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      canvas.getContext('2d')?.drawImage(image, 0, 0, 1920, 1080);

      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!png) return;

      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(png);

      const anchor = document.createElement('a');
      anchor.href = objectUrl.current;
      anchor.download = `nomiqa-${platform}.png`;
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
            {labels.platform}
          </span>
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value as MeetingPlatform)}
            className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {MEETING_PLATFORMS.map((key) => (
              <option key={key} value={key}>
                {labels.platformNames[key] ?? key}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{labels.scheme}</span>
          <select
            value={scheme}
            onChange={(event) => setScheme(event.target.value as 'light' | 'dark')}
            className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="dark">{labels.dark}</option>
            <option value="light">{labels.light}</option>
          </select>
        </label>

        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={showQr}
            onChange={(event) => setShowQr(event.target.checked)}
          />
          {labels.showQr}
        </label>

        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {labels.generate}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {svg ? (
        <div className="mt-6">
          <div
            className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800"
            // المحتوى مولَّد في خادمنا من لقطة منشورة، ونصوصه مهرَّبة في
            // المولّد نفسه (`escapeHtml` في signature-render).
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          <button
            type="button"
            onClick={() => void download()}
            className="mt-3 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {labels.download}
          </button>

          <p className="mt-2 text-xs text-neutral-500">{labels.hint}</p>
        </div>
      ) : null}
    </div>
  );
}
