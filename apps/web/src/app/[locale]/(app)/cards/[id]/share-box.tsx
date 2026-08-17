'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, LinkButton, Panel, PanelHeader } from '@nomiqa/ui';

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
    <Panel>
      <PanelHeader icon="qr" title={t('cards.share.title')} description={t('cards.share.hint')} />

      <div className="mt-5 flex items-center gap-4">
        {/* SVG يُولَّد على الخادم ولا يستفيد من محسّن الصور. */}
        <img
          src={`/c/${slug}/qr`}
          alt={t('cards.share.qrAlt')}
          width={96}
          height={96}
          className="h-24 w-24 rounded-md bg-white p-1.5 ring-1 ring-line"
        />

        <div className="min-w-0 flex-1">
          <p
            className="truncate font-mono text-xs text-muted"
            dir="ltr"
            style={{ unicodeBidi: 'isolate' }}
          >
            {publicUrl}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={copied ? 'check' : 'copy'}
              onClick={async () => {
                await navigator.clipboard.writeText(publicUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? t('cards.share.copied') : t('cards.share.copy')}
            </Button>

            <LinkButton
              size="sm"
              icon="download"
              href={`/c/${slug}/qr?format=png&size=1024`}
              download={`${slug}-qr.png`}
            >
              {t('cards.share.downloadQr')}
            </LinkButton>

            <LinkButton
              size="sm"
              variant="ghost"
              icon="external"
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('cards.share.open')}
            </LinkButton>
          </div>
        </div>
      </div>
    </Panel>
  );
}
