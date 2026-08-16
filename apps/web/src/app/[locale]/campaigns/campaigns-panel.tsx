'use client';

import type { CampaignSummary, CardSummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { createCampaignAction, deleteCampaignAction } from './actions';

interface Labels {
  name: string;
  card: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  startsAt: string;
  endsAt: string;
  create: string;
  shareUrl: string;
  copy: string;
  copied: string;
  downloadQr: string;
  report: string;
  delete: string;
  deleteConfirm: string;
  running: string;
  scheduled: string;
  ended: string;
  paused: string;
  empty: string;
  planLimit: string;
  noPublishedCards: string;
}

/**
 * إدارة الحملات (§10.4).
 *
 * الحالة المعروضة أربع لا اثنتان: «تعمل» و«موقوفة» وحدهما كانتا تخفيان
 * الفارق بين حملة تبدأ غداً وحملة انتهت أمس — وكلتاهما «لا تعمل الآن»
 * بينما الإجراء المطلوب لكل منهما مختلف تماماً.
 */
export function CampaignsPanel({
  campaigns,
  cards,
  available,
  locale,
  labels,
}: {
  campaigns: CampaignSummary[];
  cards: CardSummary[];
  available: boolean;
  locale: string;
  labels: Labels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!available) {
    return <p className="mt-4 text-sm text-neutral-500">{labels.planLimit}</p>;
  }

  function create(formData: FormData): void {
    setError(null);
    startTransition(async () => {
      const startsAt = String(formData.get('startsAt') ?? '');
      const endsAt = String(formData.get('endsAt') ?? '');

      const result = await createCampaignAction({
        name: String(formData.get('name') ?? ''),
        cardId: String(formData.get('cardId') ?? ''),
        utmSource: String(formData.get('utmSource') ?? ''),
        utmMedium: String(formData.get('utmMedium') ?? ''),
        utmCampaign: String(formData.get('utmCampaign') ?? ''),
        // `datetime-local` يعطي وقتاً بلا منطقة زمنية. نحوّله عبر
        // `Date` فيُفسَّر بمنطقة المتصفح ثم يُرسل بـISO كاملاً: تفسيره
        // على أنه UTC كان يزيح بداية كل حملة عُمانية أربع ساعات.
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        isActive: true,
      });

      if (!result.ok) setError(result.message ?? null);
    });
  }

  function remove(id: string): void {
    if (!globalThis.confirm(labels.deleteConfirm)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await deleteCampaignAction(id);
      if (!result.ok) setError(result.message ?? null);
    });
  }

  return (
    <div className="mt-4">
      <form action={create} className="grid gap-3 sm:grid-cols-2">
        <Field name="name" label={labels.name} required maxLength={120} />

        <label className="text-sm">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{labels.card}</span>
          <select
            name="cardId"
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.fullName}
              </option>
            ))}
          </select>
        </label>

        <Field name="utmSource" label={labels.utmSource} required dir="ltr" />
        <Field name="utmMedium" label={labels.utmMedium} required dir="ltr" />
        <Field name="utmCampaign" label={labels.utmCampaign} required dir="ltr" />

        <div className="grid grid-cols-2 gap-3">
          <Field name="startsAt" label={labels.startsAt} type="datetime-local" />
          <Field name="endsAt" label={labels.endsAt} type="datetime-local" />
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending || cards.length === 0}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {labels.create}
          </button>
        </div>
      </form>

      {cards.length === 0 ? (
        <p className="mt-2 text-xs text-amber-600">{labels.noPublishedCards}</p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {campaigns.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">{labels.empty}</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {campaigns.map((campaign) => (
            <li
              key={campaign.id}
              className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{campaign.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-neutral-500" dir="ltr">
                    {campaign.utm.source} / {campaign.utm.medium} / {campaign.utm.campaign}
                  </p>
                </div>

                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs dark:bg-neutral-800">
                  {statusLabel(campaign, labels)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-neutral-500">{labels.shareUrl}:</span>
                <code
                  className="truncate rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-800"
                  dir="ltr"
                >
                  {campaign.shareUrl}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(campaign.shareUrl);
                    setCopied(campaign.id);
                    setTimeout(() => setCopied(null), 2000);
                  }}
                  className="rounded-lg bg-neutral-100 px-2.5 py-1 font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                >
                  {copied === campaign.id ? labels.copied : labels.copy}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <a
                  href={`/t/${campaign.code}/qr?format=png&size=1024`}
                  download={`${campaign.code}-qr.png`}
                  className="rounded-lg bg-neutral-100 px-2.5 py-1 font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                >
                  {labels.downloadQr}
                </a>

                <a
                  href={`/${locale}/campaigns/${campaign.id}`}
                  className="rounded-lg bg-neutral-100 px-2.5 py-1 font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                >
                  {labels.report}
                </a>

                <button
                  type="button"
                  onClick={() => remove(campaign.id)}
                  disabled={pending}
                  className="rounded-lg px-2.5 py-1 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
                >
                  {labels.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusLabel(campaign: CampaignSummary, labels: Labels): string {
  if (campaign.isRunning) return labels.running;
  if (!campaign.isActive) return labels.paused;
  if (campaign.startsAt && new Date(campaign.startsAt) > new Date()) return labels.scheduled;
  return labels.ended;
}

function Field({
  name,
  label,
  type = 'text',
  required = false,
  maxLength,
  dir,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  dir?: 'ltr';
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        dir={dir}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
    </label>
  );
}
