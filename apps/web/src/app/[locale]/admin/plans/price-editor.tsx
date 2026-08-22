'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert, Button, Field, Input } from '@nomiqa/ui';
import { upsertPlanPriceAction } from '../actions';

/**
 * تحرير سعر الباقة.
 *
 * الإدخال بالريال والتخزين بالبيسة: المستخدم يفكّر بالريال، والحساب
 * يجب أن يبقى صحيحاً بلا فاصلة عائمة. التحويل هنا في موضع واحد، ورقم
 * لا يقبل التحويل يُرفض قبل الإرسال بدل أن يصل صفراً إلى الخادم.
 *
 * تغيير السعر لا يمسّ فاتورة صادرة: الفواتير تنسخ المبلغ عند إصدارها.
 */
export function PriceEditor({
  planKey,
  monthBaisa,
  yearBaisa,
}: {
  planKey: string;
  monthBaisa: number | null;
  yearBaisa: number | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [month, setMonth] = useState(monthBaisa === null ? '' : String(monthBaisa / 1000));
  const [year, setYear] = useState(yearBaisa === null ? '' : String(yearBaisa / 1000));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(interval: 'month' | 'year', raw: string) {
    setError(null);
    setSaved(false);

    const rials = Number(raw);
    if (!Number.isFinite(rials) || rials <= 0) {
      setError(t('admin.plans.invalidPrice'));
      return;
    }

    startTransition(async () => {
      const result = await upsertPlanPriceAction(planKey, interval, Math.round(rials * 1000));
      if (!result.ok) {
        setError(result.message ?? t('errors.generic'));
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved && !error ? <Alert tone="success">{t('admin.plans.priceSaved')}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('admin.plans.monthly')} htmlFor={`month-${planKey}`} hint="OMR">
          <div className="flex gap-2">
            <Input
              id={`month-${planKey}`}
              inputMode="decimal"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              disabled={pending}
            />
            <Button size="sm" variant="secondary" onClick={() => save('month', month)} disabled={pending}>
              {t('common.save')}
            </Button>
          </div>
        </Field>

        <Field label={t('admin.plans.yearly')} htmlFor={`year-${planKey}`} hint="OMR">
          <div className="flex gap-2">
            <Input
              id={`year-${planKey}`}
              inputMode="decimal"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              disabled={pending}
            />
            <Button size="sm" variant="secondary" onClick={() => save('year', year)} disabled={pending}>
              {t('common.save')}
            </Button>
          </div>
        </Field>
      </div>

      <p className="text-xs text-muted">{t('admin.plans.priceNote')}</p>
    </div>
  );
}
