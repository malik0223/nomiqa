'use client';

import type { WalletAvailability } from '@nomiqa/contracts';
import { Alert, Button, Panel, PanelHeader } from '@nomiqa/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { issueWalletPassAction } from '../actions';

/**
 * إضافة البطاقة إلى محفظة الهاتف (§10.2).
 *
 * زرّان لا زر: المنصتان مختلفتان في آلية التسليم، وإخفاء ذلك خلف زر
 * واحد «أضف إلى المحفظة» كان يعني سلوكاً مختلفاً بلا تفسير — رابط
 * يُفتح هنا وملف يُنزَّل هناك.
 *
 * والزر المعطّل يظهر بسببه لا يختفي: مؤسسة لا ترى الميزة لا تعرف أنها
 * موجودة، فلا تسأل عنها ولا ترقّي باقتها.
 */
export function WalletBox({
  cardId,
  availability,
}: {
  cardId: string;
  availability: WalletAvailability;
}) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function issue(platform: 'apple' | 'google'): void {
    setError(null);

    startTransition(async () => {
      const result = await issueWalletPassAction({ cardId, platform });

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      // Google تعطي رابطاً يفتحه المستخدم فتضيف البطاقة، وApple تعطي
      // مساراً يُنزَّل منه ملف يفتحه النظام. كلاهما تنقّل خارج التطبيق.
      const destination = result.issue?.saveUrl ?? result.issue?.downloadPath;
      if (destination) globalThis.location.assign(destination);
    });
  }

  if (!availability.apple && !availability.google) {
    return null;
  }

  return (
    <Panel>
      <PanelHeader icon="wallet" title={t('wallet.title')} description={t('wallet.hint')} />

      <div className="mt-4 flex flex-wrap gap-2">
        {availability.apple ? (
          <Button size="sm" variant="primary" onClick={() => issue('apple')} disabled={pending}>
            {t('wallet.apple')}
          </Button>
        ) : null}

        {availability.google ? (
          <Button size="sm" onClick={() => issue('google')} disabled={pending}>
            {t('wallet.google')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      ) : null}
    </Panel>
  );
}
