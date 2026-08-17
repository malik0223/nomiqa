import { PageHeader } from '@nomiqa/ui';
import type {
  InvoiceSummary,
  OrganizationEntitlements,
  Paginated,
  PlanSummary,
  SubscriptionSummary,
} from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ApiError } from '@/lib/api-client';
import {
  fetchEntitlementsSummary,
  fetchInvoices,
  fetchPlans,
  fetchSubscription,
  formatLimit,
  formatOmr,
} from '@/lib/billing';
import { activeOrganizationId } from '@/lib/cards';
import { PlanPicker } from './plan-picker';
import { SubscriptionActions } from './subscription-actions';
import { formatDate } from '@/lib/format';

interface PageProps {
  params: Promise<{ locale: string }>;
}

/**
 * شاشة الفوترة (§9.4).
 *
 * الاستخدام مقابل الحد معروض أولاً، قبل الباقات: العميل يفتح هذه
 * الشاشة ليعرف «هل أحتاج ترقية؟»، والإجابة رقم لا قائمة أسعار.
 */
export default async function BillingPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations();

  let entitlements: OrganizationEntitlements;
  let subscription: SubscriptionSummary | null;
  let plans: PlanSummary[];
  let invoices: Paginated<InvoiceSummary>;

  try {
    const organizationId = await activeOrganizationId();

    [entitlements, subscription, plans, invoices] = await Promise.all([
      fetchEntitlementsSummary(organizationId),
      fetchSubscription(organizationId),
      fetchPlans(organizationId),
      fetchInvoices(organizationId),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');
    const requestId = error instanceof ApiError ? error.requestId : undefined;

    return (
      <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
        <PageHeader eyebrow={t('nav.groups.organization')} title={t('billing.title')} />
        <p className="mt-4 text-muted">{message}</p>
        {requestId ? (
          <p className="mt-2 font-mono text-xs text-faint">requestId: {requestId}</p>
        ) : null}
      </main>
    );
  }

  const usageRows = [
    { key: 'cards', used: entitlements.usage.cards, limit: entitlements.limits.maxCards },
    { key: 'members', used: entitlements.usage.members, limit: entitlements.limits.maxMembers },
    {
      key: 'departments',
      used: entitlements.usage.departments,
      limit: entitlements.limits.maxDepartments,
    },
    { key: 'branches', used: entitlements.usage.branches, limit: entitlements.limits.maxBranches },
    { key: 'contacts', used: entitlements.usage.contacts, limit: entitlements.limits.maxContacts },
  ];

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <PageHeader eyebrow={t('nav.groups.organization')} title={t('billing.title')} />
        <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary">
          {entitlements.planName}
        </span>
      </header>

      {/* التحذير قبل كل شيء: مهلة السماح تنتهي بخفض الباقة، والعميل
          يجب أن يراها قبل أن يقرأ أي شيء آخر في الصفحة. */}
      {entitlements.inGracePeriod ? (
        <p className="mt-4 rounded-lg border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-900 dark:border-red-800">
          {t('billing.gracePeriodWarning')}
        </p>
      ) : null}

      {subscription?.cancelAtPeriodEnd ? (
        <p className="mt-4 rounded-lg border border-warning-100 bg-warning-50 px-4 py-3 text-sm text-warning-600 dark:border-amber-800">
          {t('billing.cancelScheduled', {
            date: formatDate(subscription.currentPeriodEnd, locale),
          })}
        </p>
      ) : null}

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('billing.usage')}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {usageRows.map((row) => {
            const over = row.limit >= 0 && row.used > row.limit;
            return (
              <div
                key={row.key}
                className="rounded-card border border-line px-4 py-3"
              >
                <dt className="text-xs text-faint">{t(`billing.limits.${row.key}`)}</dt>
                <dd
                  className={`mt-1 text-lg font-semibold ${over ? 'text-danger-500 ' : ''}`}
                >
                  {row.used} / {formatLimit(row.limit, t('billing.unlimited'))}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('billing.plans')}</h2>
        <PlanPicker
          plans={plans}
          currentPlanKey={entitlements.planKey}
          currentInterval={subscription?.interval ?? 'month'}
          seats={Math.max(1, entitlements.usage.members)}
          locale={locale}
          labels={{
            month: t('billing.monthly'),
            year: t('billing.yearly'),
            current: t('billing.currentPlan'),
            choose: t('billing.choosePlan'),
            preview: t('billing.preview'),
            couponCode: t('billing.couponCode'),
            apply: t('common.apply'),
            amountDue: t('billing.amountDue'),
            vat: t('billing.vat'),
            total: t('billing.total'),
            confirm: t('billing.confirmChange'),
            processing: t('common.saving'),
            blockers: t('billing.downgradeBlockers'),
            lostFeatures: t('billing.lostFeatures'),
            trialDays: t.raw('billing.trialDays') as string,
            unlimited: t('billing.unlimited'),
            seats: t('billing.seats'),
          }}
        />
      </section>

      {subscription ? (
        <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
          <h2 className="font-display text-base font-semibold tracking-tight">{t('billing.subscription')}</h2>
          <SubscriptionActions
            subscription={subscription}
            locale={locale}
            labels={{
              renewsOn: t('billing.renewsOn'),
              cancel: t('billing.cancel'),
              cancelConfirm: t('billing.cancelConfirm'),
              cancelImmediate: t('billing.cancelImmediate'),
              resume: t('billing.resume'),
              keep: t('common.cancel'),
              processing: t('common.saving'),
            }}
          />
        </section>
      ) : null}

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('billing.invoices')}</h2>

        {invoices.data.length === 0 ? (
          <p className="mt-3 text-sm text-faint">{t('billing.noInvoices')}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {invoices.data.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Link
                  href={`/billing/invoices/${invoice.id}`}
                  className="flex-1 font-mono text-sm text-primary hover:underline"
                >
                  {invoice.number}
                </Link>
                <span className="text-sm">{formatOmr(invoice.totalBaisa, locale)}</span>
                <span className="text-xs text-faint">
                  {t(`billing.invoiceStatus.${invoice.status}`)}
                </span>
                <span className="text-xs text-faint">
                  {invoice.issuedAt
                    ? formatDate(invoice.issuedAt, locale)
                    : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
