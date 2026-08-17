'use client';

import type { BillingInterval, PlanChangePreview, PlanSummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { checkoutAction, previewPlanAction } from './actions';

interface Labels {
  month: string;
  year: string;
  current: string;
  choose: string;
  preview: string;
  couponCode: string;
  apply: string;
  amountDue: string;
  vat: string;
  total: string;
  confirm: string;
  processing: string;
  blockers: string;
  lostFeatures: string;
  trialDays: string;
  unlimited: string;
  seats: string;
}

/**
 * اختيار الباقة (§9.4).
 *
 * التسلسل مقصود: اختيار → **معاينة** → تأكيد. المعاينة تُظهر المبلغ
 * الفعلي بعد رصيد الفترة الحالية والخصم، والموانع إن كان خفضاً.
 * الذهاب مباشرةً إلى بوابة الدفع كان سيجعل العميل يكتشف مبلغاً غير
 * متوقع في صفحة لا يملك فيها إلا الدفع أو الإلغاء.
 *
 * لا مبلغ يُرسَل من هنا: المكوّن يرسل مفتاح باقة ودورة وكود خصم،
 * والخادم يحسب. السعر ليس قابلاً للتفاوض في أدوات المطوّر.
 */
export function PlanPicker({
  plans,
  currentPlanKey,
  currentInterval,
  seats,
  locale,
  labels,
}: {
  plans: PlanSummary[];
  currentPlanKey: string;
  currentInterval: BillingInterval;
  seats: number;
  locale: string;
  labels: Labels;
}) {
  const [interval, setInterval] = useState<BillingInterval>(currentInterval);
  const [selected, setSelected] = useState<string | null>(null);
  const [coupon, setCoupon] = useState('');
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runPreview(planKey: string): void {
    setError(null);
    setSelected(planKey);

    startTransition(async () => {
      const result = await previewPlanAction({
        planKey,
        interval,
        quantity: seats,
        couponCode: coupon.trim() || null,
      });

      if (!result.ok) {
        setError(result.message ?? null);
        setPreview(null);
        return;
      }

      setPreview(result.preview ?? null);
    });
  }

  function confirm(): void {
    if (!selected) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await checkoutAction({
        planKey: selected,
        interval,
        quantity: seats,
        couponCode: coupon.trim() || null,
      });

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      // التوجيه إلى بوابة الدفع يجري هنا لا في الخادم: الإجراء الخادمي
      // قد يعيد «فُعِّل فوراً» بلا رابط (تجربة أو خفض)، والتوجيه من
      // الخادم كان سيفرض مساراً واحداً على حالتين مختلفتين.
      if (result.result?.outcome === 'redirect' && result.result.checkoutUrl) {
        globalThis.location.href = result.result.checkoutUrl;
        return;
      }

      setPreview(null);
      setSelected(null);
      globalThis.location.reload();
    });
  }

  return (
    <div className="mt-4">
      <div className="inline-flex rounded-lg border border-line p-1">
        {(['month', 'year'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setInterval(option);
              setPreview(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm ${
              interval === option
                ? 'bg-primary text-white'
                : 'text-muted'
            }`}
          >
            {option === 'month' ? labels.month : labels.year}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = plan.prices.find((entry) => entry.interval === interval);
          const isCurrent = plan.key === currentPlanKey;

          return (
            <article
              key={plan.id}
              className={`rounded-xl border p-5 ${
                isCurrent
                  ? 'border-accent-line bg-accent-soft/40'
                  : 'border-line'
              }`}
            >
              <h3 className="font-semibold">{locale === 'en' ? (plan.nameEn ?? plan.name) : plan.name}</h3>

              <p className="mt-1 font-display text-2xl font-bold tracking-tight">
                {price ? formatOmr(price.amountBaisa, locale) : '—'}
              </p>

              {plan.trialDays > 0 && !isCurrent ? (
                <p className="mt-1 text-xs text-primary">
                  {labels.trialDays.replace('{days}', String(plan.trialDays))}
                </p>
              ) : null}

              <ul className="mt-3 space-y-1 text-xs text-muted">
                <li>
                  {plan.limits.maxCards < 0 ? labels.unlimited : plan.limits.maxCards} ·{' '}
                  {plan.limits.maxMembers < 0 ? labels.unlimited : plan.limits.maxMembers}{' '}
                  {labels.seats}
                </li>
                {plan.features.slice(0, 4).map((feature) => (
                  <li key={feature}>· {feature}</li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => runPreview(plan.key)}
                disabled={pending || isCurrent}
                className="mt-4 w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {isCurrent ? labels.current : labels.choose}
              </button>
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={coupon}
          onChange={(event) => setCoupon(event.target.value)}
          placeholder={labels.couponCode}
          aria-label={labels.couponCode}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
        />
        {selected ? (
          <button
            type="button"
            onClick={() => runPreview(selected)}
            disabled={pending}
            className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-fg transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent-line focus:bg-surface"
          >
            {labels.apply}
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger-500">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-5 rounded-card border border-line p-5">
          <h3 className="font-semibold">{labels.preview}</h3>

          {preview.blockers.length > 0 ? (
            <div className="mt-3 rounded-lg border border-danger-100 bg-danger-50 p-3 text-sm text-danger-900 dark:border-red-800">
              <p className="font-medium">{labels.blockers}</p>
              <ul className="mt-1 space-y-0.5">
                {preview.blockers.map((blocker) => (
                  <li key={blocker.code}>
                    {blocker.code}: {blocker.current} / {blocker.allowed}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.lostFeatures.length > 0 ? (
            <p className="mt-3 text-sm text-warning-600 dark:text-amber-400">
              {labels.lostFeatures}: {preview.lostFeatures.join('، ')}
            </p>
          ) : null}

          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-faint">{labels.amountDue}</dt>
              <dd>{formatOmr(preview.amountDueBaisa, locale)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-faint">{labels.vat}</dt>
              <dd>{formatOmr(preview.vatBaisa, locale)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1 font-semibold">
              <dt>{labels.total}</dt>
              <dd>{formatOmr(preview.totalBaisa, locale)}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={confirm}
            disabled={pending || preview.blockers.length > 0}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? labels.processing : labels.confirm}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** نسخة عميلية من التنسيق — `lib/billing` خادمية فلا تُستورد هنا. */
function formatOmr(baisa: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-OM' : 'ar-OM', {
    style: 'currency',
    currency: 'OMR',
    minimumFractionDigits: 3,
  }).format(baisa / 1000);
}
