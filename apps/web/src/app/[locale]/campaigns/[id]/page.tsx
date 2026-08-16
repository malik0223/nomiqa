import type { CampaignReport } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ApiError } from '../../../../lib/api-client';
import { auth0 } from '../../../../lib/auth0';
import { activeOrganizationId } from '../../../../lib/cards';
import { fetchCampaignReport } from '../../../../lib/presence';

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

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  const selected = (RANGES as readonly string[]).includes(range ?? '') ? range! : '90d';

  let report: CampaignReport;

  try {
    const organizationId = await activeOrganizationId();
    report = await fetchCampaignReport(organizationId, id, selected);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('campaigns.report')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">{message}</p>
      </main>
    );
  }

  const peak = Math.max(1, ...report.series.map((point) => point.views));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm text-neutral-500">{t('campaigns.report')}</p>
      <h1 className="mt-1 text-2xl font-bold">{report.name}</h1>

      <nav className="mt-4 flex gap-2 text-sm">
        {RANGES.map((option) => (
          <a
            key={option}
            href={`/${locale}/campaigns/${id}?range=${option}`}
            className={
              option === selected
                ? 'rounded-lg bg-neutral-900 px-3 py-1.5 font-medium text-white dark:bg-white dark:text-neutral-900'
                : 'rounded-lg bg-neutral-100 px-3 py-1.5 font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700'
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
        <h2 className="text-lg font-semibold">{t('campaigns.daily')}</h2>
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

      <p className="mt-8 text-xs text-neutral-500">
        {report.updatedAt
          ? t('dashboard.updatedAt', { time: new Date(report.updatedAt).toLocaleString() })
          : t('dashboard.noActivity')}
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
    </div>
  );
}
