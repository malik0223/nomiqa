'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Badge, Button, Checkbox, Input } from '@nomiqa/ui';
import type { AdminFeatureFlag } from '@/lib/admin';
import { updateFeatureFlagAction } from '../actions';

/**
 * راية ميزة واحدة.
 *
 * النسبة تُحفظ بزرّ لا بتغيّر القيمة: الطرح التدريجي قرار، وحفظه مع كل
 * ضغطة مفتاح كان يعني نشر الميزة على 1% ثم 12% ثم 12.5% أثناء الكتابة.
 * أما المفتاح فيُحفظ فوراً — التعطيل الطارئ لا يحتمل خطوة ثانية.
 */
export function FlagRow({ flag }: { flag: AdminFeatureFlag }) {
  const t = useTranslations();
  const router = useRouter();
  const [rollout, setRollout] = useState(String(flag.rolloutPercentage));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(enabled: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await updateFeatureFlagAction(flag.key, { enabled });
      if (!result.ok) {
        setError(result.message ?? t('errors.generic'));
        return;
      }
      router.refresh();
    });
  }

  function saveRollout() {
    setError(null);
    const value = Number(rollout);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setError(t('admin.flags.invalidRollout'));
      return;
    }

    startTransition(async () => {
      const result = await updateFeatureFlagAction(flag.key, { rolloutPercentage: value });
      if (!result.ok) {
        setError(result.message ?? t('errors.generic'));
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <bdi className="font-mono text-[0.8125rem] font-medium">{flag.key}</bdi>
          {flag.enabled ? (
            <Badge tone="success">{t('admin.flags.on')}</Badge>
          ) : (
            <Badge tone="neutral">{t('admin.flags.off')}</Badge>
          )}
          {flag.overrides.length > 0 ? (
            <Badge tone="ink">
              {t('admin.flags.overrides', { count: flag.overrides.length })}
            </Badge>
          ) : null}
        </div>
        {flag.description ? (
          <p className="mt-0.5 text-xs text-muted">{flag.description}</p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted" htmlFor={`rollout-${flag.key}`}>
          {t('admin.flags.rollout')}
        </label>
        <Input
          id={`rollout-${flag.key}`}
          inputMode="numeric"
          className="w-20"
          value={rollout}
          onChange={(event) => setRollout(event.target.value)}
          disabled={pending}
        />
        <Button size="sm" variant="secondary" onClick={saveRollout} disabled={pending}>
          {t('common.save')}
        </Button>
      </div>

      <Checkbox
        checked={flag.enabled}
        onChange={(event) => toggle(event.target.checked)}
        disabled={pending}
        label={t('admin.flags.enabled')}
      />
    </li>
  );
}
