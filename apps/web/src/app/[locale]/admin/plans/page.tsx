import { getTranslations } from 'next-intl/server';
import { Badge, Panel, PanelHeader } from '@nomiqa/ui';
import { fetchPlans } from '@/lib/admin';
import { PriceEditor } from './price-editor';

export default async function AdminPlansPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();
  const plans = await fetchPlans();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t('admin.plans.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('admin.plans.subtitle')}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {plans.map((plan) => {
          const month = plan.prices.find((price) => price.interval === 'month');
          const year = plan.prices.find((price) => price.interval === 'year');

          return (
            <Panel key={plan.id}>
              <PanelHeader
                title={locale === 'en' ? (plan.nameEn ?? plan.name) : plan.name}
                description={plan.key}
                actions={
                  <div className="flex gap-1.5">
                    {plan.isPublic ? (
                      <Badge tone="success">{t('admin.plans.public')}</Badge>
                    ) : (
                      <Badge tone="neutral">{t('admin.plans.private')}</Badge>
                    )}
                    {!plan.isActive ? (
                      <Badge tone="warning">{t('admin.plans.inactive')}</Badge>
                    ) : null}
                  </div>
                }
              />

              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted">{t('admin.plans.subscribers')}</div>
                    <div className="nq-num text-lg font-semibold">{plan.subscriberCount}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">{t('admin.plans.trial')}</div>
                    <div className="nq-num text-lg font-semibold">{plan.trialDays}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">{t('admin.plans.features')}</div>
                    <div className="nq-num text-lg font-semibold">{plan.features.length}</div>
                  </div>
                </div>

                <PriceEditor
                  planKey={plan.key}
                  monthBaisa={month?.amountBaisa ?? null}
                  yearBaisa={year?.amountBaisa ?? null}
                />

                <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {Object.entries(plan.limits).map(([key, value]) => (
                    <span
                      key={key}
                      className="rounded-full border border-line px-2 py-0.5 text-[0.6875rem] text-muted"
                    >
                      {key}: <bdi className="nq-num">{value === -1 ? '∞' : value}</bdi>
                    </span>
                  ))}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
