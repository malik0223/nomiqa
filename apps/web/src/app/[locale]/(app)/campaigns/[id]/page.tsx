import type { CampaignReport } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { ApiError } from '@/lib/api-client';
import { activeOrganizationId } from '@/lib/cards';
import { fetchCampaignReport } from '@/lib/presence';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ range?: string }>;
}

const RANGES = ['30d', '90d', '365d'] as const;

/**
 * تقرير أداء حملة (§10.4).
 *
 * الأرقام تُقرأ من التجميعات فتبقى بعد حذف الأحداث الخام: حملة انتهت
 * قبل أربعة أشهر يجب أن يظل تقريرها قابلاً للقراءة، وهو السبب الذي
 * جعل مقاييس الإسناد تسكن `analytics_rollups` منذ البداية.
 */
export default async function CampaignReportPage({ params, searchParams }: PageProps) {
  const { locale, id } = await params;
  const { range } = await searchParams;
  const t = await getTranslations();

  const selected = (RANGES as readonly string[]).includes(range ?? '') ? range! : '90d';

  let report: CampaignReport;

  try {
    const organizationId = await activeOrganizationId();
    report = await fetchCampaignReport(organizationId, id, selected);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="font-display text-2xl font-bold tracking-tight">{t('campaigns.report')}</h1>
        <p className="mt-4 text-muted">{message}</p>
      </main>
    );
  }

  const peak = Math.max(1, ...report.series.map((point) => point.views));

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <p className="text-sm text-faint">{t('campaigns.report')}</p>
      <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">{report.name}</h1>

      <nav className="mt-4 flex gap-2 text-sm">
        {RANGES.map((option) => (
          <a
            key={option}
            href={`/${locale}/campaigns/${id}?range=${option}`}
            className={
              option === selected
                ? 'rounded-md bg-primary px-3 py-1.5 font-medium text-primary-fg shadow-sheet'
                : 'rounded-md border border-line bg-surface px-3 py-1.5 font-medium transition-colors hover:border-line-strong hover:bg-surface-2'
            }
          >
            {t(`campaigns.ranges.${option}`)}
          </a>
        ))}
      </nav>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t('campaigns.views')} value={report.views} />
        <Stat label={t('campaigns.uniqueVisitors')} value={report.uniqueVisitors} />
        <Stat label={t('campaigns.formSubmits')} value={report.formSubmits} />
        <Stat label={t('campaigns.conversionRate')} value={`${report.conversionRate}%`} />
      </dl>

      {/*
        رسم بأعمدة CSS لا مكتبة رسوم: السلسلة يومية بحد أقصى 365 نقطة،
        ومكتبة رسم كاملة لأجلها تضيف إلى الحزمة أكثر مما تضيف للمستخدم.
      */}
      <section className="mt-10">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('campaigns.daily')}</h2>
        <div className="mt-4 flex h-40 items-end gap-px" dir="ltr">
          {report.series.map((point) => (
            <div
              key={point.date}
              title={`${new Date(point.date).toLocaleDateString()} — ${point.views}`}
              style={{ height: `${Math.round((point.views / peak) * 100)}%` }}
              className="min-h-px flex-1 rounded-t bg-neutral-300 dark:bg-neutral-700"
            />
          ))}
        </div>
      </section>

      <p className="mt-8 text-xs text-faint">
        {report.updatedAt
          ? t('dashboard.updatedAt', { time: new Date(report.updatedAt).toLocaleString() })
          : t('dashboard.noActivity')}
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-sheet">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold tracking-tight">{value}</dd>
    </div>
  );
}
