import { getTranslations } from 'next-intl/server';
import { Panel, PanelHeader, Stat, StatGrid } from '@nomiqa/ui';
import { fetchPlatformTotals, fetchRevenue, formatOmr } from '@/lib/admin';

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();

  const [totals, revenue] = await Promise.all([fetchPlatformTotals(), fetchRevenue(6)]);

  const omr = revenue.totals.find((row) => row.currency === 'OMR');
  const activeSubs = revenue.subscriptions
    .filter((row) => row.status === 'active' || row.status === 'trialing')
    .reduce((sum, row) => sum + row.count, 0);

  // أعلى شهر يحدّد مقياس الأعمدة. بلا إيراد بعد، نتفادى القسمة على صفر.
  const peak = Math.max(1, ...revenue.byMonth.map((row) => row.paidBaisa));

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t('admin.overview.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('admin.overview.subtitle')}</p>
      </div>

      <StatGrid>
        <Stat label={t('admin.overview.organizations')} value={totals.organizations.toLocaleString()} />
        <Stat label={t('admin.overview.users')} value={totals.users.toLocaleString()} />
        <Stat label={t('admin.overview.memberships')} value={totals.activeMemberships.toLocaleString()} />
        <Stat label={t('admin.overview.files')} value={totals.files.toLocaleString()} />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title={t('admin.overview.revenueTitle')} />
          <div className="flex flex-col gap-4 p-5">
            <StatGrid>
              <Stat
                label={t('admin.overview.collected')}
                value={omr ? formatOmr(omr.paidBaisa, locale) : formatOmr(0, locale)}
              />
              <Stat
                label={t('admin.overview.paidInvoices')}
                value={(omr?.paidInvoices ?? 0).toLocaleString()}
              />
              <Stat label={t('admin.overview.activeSubs')} value={activeSubs.toLocaleString()} />
            </StatGrid>

            {revenue.byMonth.length > 0 ? (
              <div className="flex h-28 items-end gap-1.5" role="img" aria-label={t('admin.overview.revenueTitle')}>
                {revenue.byMonth.map((row) => (
                  <div key={`${row.month}-${row.currency}`} className="flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className="w-full rounded-t-sm bg-accent-line/70"
                      style={{ height: `${Math.max(3, (row.paidBaisa / peak) * 100)}%` }}
                      title={`${row.month} — ${formatOmr(row.paidBaisa, locale)}`}
                    />
                    <span className="nq-num text-[0.625rem] text-muted">{row.month.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">{t('admin.overview.noRevenue')}</p>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title={t('admin.overview.subsTitle')} />
          <div className="p-5">
            {revenue.subscriptions.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.overview.noSubs')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-start text-xs text-muted">
                    <th className="pb-2 text-start font-medium">{t('admin.plans.plan')}</th>
                    <th className="pb-2 text-start font-medium">{t('admin.overview.status')}</th>
                    <th className="pb-2 text-end font-medium">{t('admin.overview.count')}</th>
                    <th className="pb-2 text-end font-medium">{t('admin.overview.seats')}</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.subscriptions.map((row) => (
                    <tr key={`${row.planKey}-${row.status}`} className="border-b border-line/60">
                      <td className="py-2 font-medium">{row.planKey}</td>
                      <td className="py-2 text-muted">{row.status}</td>
                      <td className="nq-num py-2 text-end">{row.count}</td>
                      <td className="nq-num py-2 text-end">{row.seats}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
