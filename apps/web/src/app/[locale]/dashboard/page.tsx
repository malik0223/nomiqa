import type { AnalyticsOverview, ContactSummary, MeResponse } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { auth0 } from '../../../lib/auth0';
import { activeOrganizationId } from '../../../lib/cards';
import { fetchAnalytics, fetchContacts } from '../../../lib/contacts';
import { Link } from '../../../i18n/routing';
import { ActivityChart } from './activity-chart';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string }>;
}

const RANGES = ['7d', '30d', '90d'] as const;
type Range = (typeof RANGES)[number];

/**
 * لوحة المستخدم (§8.5 من خارطة الطريق).
 *
 * تجيب أربعة أسئلة بترتيب مقصود: كيف أداء بطاقتي؟ من تواصل معي؟ أي
 * الروابط يُستخدم؟ وكيف يتحرك النشاط؟ — كل قسم منها بند صريح في
 * الخارطة، وترتيبها من الأثر إلى التفصيل.
 */
export default async function DashboardPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { range } = await searchParams;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  const selected: Range = RANGES.includes(range as Range) ? (range as Range) : '30d';

  let me: MeResponse;
  let analytics: AnalyticsOverview | null = null;
  let recent: ContactSummary[] = [];

  try {
    me = await apiFetch<MeResponse>('/me');
  } catch (error) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('errors.generic')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">
          {error instanceof ApiError ? error.message : t('errors.generic')}
        </p>
      </main>
    );
  }

  try {
    const organizationId = await activeOrganizationId();
    const [overview, contacts] = await Promise.all([
      fetchAnalytics(organizationId, { range: selected }),
      fetchContacts(organizationId, { pageSize: 5 }),
    ]);

    analytics = overview;
    recent = contacts.data;
  } catch {
    // اللوحة تعرض ما استطاعت: فشل التحليلات لا يجب أن يحجب اسم
    // المستخدم ولا روابط التنقل. الأقسام المعتمدة عليه تختفي وحدها.
    analytics = null;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/cards"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t('dashboard.myCards')}
          </Link>
          <Link
            href="/contacts"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('contacts.title')}
          </Link>

          {/* شاشات المرحلة 4. تظهر للجميع ويحكمها الـAPI: إخفاؤها
              بحسب الصلاحية هنا كان سيتطلب قراءة الصلاحيات في كل تحميل
              للوحة، والرفض من الخادم هو الحدّ الحقيقي على أي حال. */}
          <Link
            href="/team"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('team.title')}
          </Link>
          <Link
            href="/billing"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('billing.title')}
          </Link>

          {/* شاشات المرحلة 5 — نفس القاعدة أعلاه: الظهور للجميع
              والحدّ من الخادم. */}
          <Link
            href="/signature"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('signature.title')}
          </Link>
          <Link
            href="/nfc"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('nfc.title')}
          </Link>
          <Link
            href="/campaigns"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('campaigns.title')}
          </Link>

          {/* شاشات المرحلة 6 — نفس القاعدة: الظهور للجميع والحدّ من
              الخادم. المسح أولاً لأنه الشاشة الوحيدة هنا التي تُفتح
              وقوفاً في قاعة معرض، لا من مكتب. */}
          <Link
            href="/scan"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('scan.title')}
          </Link>
          <Link
            href="/events"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('events.title')}
          </Link>
          <Link
            href="/integrations"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('integrations.title')}
          </Link>

          <a
            href="/auth/logout"
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            {t('common.signOut')}
          </a>
        </div>
      </header>

      <p className="mt-6 text-lg">
        {t('dashboard.welcome', { name: me.user.fullName ?? me.user.email })}
      </p>

      {analytics === null ? (
        <p className="mt-10 text-neutral-600 dark:text-neutral-400">
          {t('dashboard.analyticsUnavailable')}
        </p>
      ) : (
        <>
          <nav className="mt-10 flex items-center gap-2 text-sm">
            {RANGES.map((option) => (
              <a
                key={option}
                href={`?range=${option}`}
                aria-current={option === selected ? 'page' : undefined}
                className={
                  option === selected
                    ? 'rounded-lg bg-neutral-900 px-3 py-1.5 font-medium text-white dark:bg-white dark:text-neutral-900'
                    : 'rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }
              >
                {t(`dashboard.ranges.${option}`)}
              </a>
            ))}
          </nav>

          <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label={t('dashboard.metrics.views')} value={analytics.summary.views} />
            <Metric
              label={t('dashboard.metrics.uniqueVisitors')}
              value={analytics.summary.uniqueVisitors}
            />
            <Metric
              label={t('dashboard.metrics.linkClicks')}
              value={analytics.summary.linkClicks}
            />
            <Metric
              label={t('dashboard.metrics.vcardDownloads')}
              value={analytics.summary.vcardDownloads}
            />
            <Metric
              label={t('dashboard.metrics.formSubmits')}
              value={analytics.summary.formSubmits}
            />
            <Metric
              label={t('dashboard.metrics.conversionRate')}
              value={`${analytics.summary.conversionRate}%`}
            />
          </section>

          {/*
            وقت آخر تجميع معلن عمداً: الأرقام تتأخر دقائق، وإخفاء ذلك
            يجعل صاحب البطاقة يظن أن زيارة للتو ضاعت.
          */}
          {analytics.updatedAt ? (
            <p className="mt-2 text-xs text-neutral-500">
              {t('dashboard.updatedAt', {
                time: new Date(analytics.updatedAt).toLocaleString(locale),
              })}
            </p>
          ) : null}

          <section className="mt-8 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">{t('dashboard.activity')}</h2>
            <ActivityChart
              series={analytics.series}
              locale={locale}
              emptyLabel={t('dashboard.noActivity')}
            />
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
              <h2 className="text-sm font-semibold">{t('dashboard.recentContacts')}</h2>

              {recent.length === 0 ? (
                <p className="mt-4 text-sm text-neutral-500">{t('contacts.empty')}</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {recent.map((contact) => (
                    <li key={contact.id} className="flex items-center justify-between gap-3">
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="min-w-0 truncate text-sm font-medium hover:underline"
                      >
                        {contact.fullName}
                      </Link>
                      <time
                        dateTime={contact.capturedAt}
                        className="shrink-0 text-xs text-neutral-500"
                      >
                        {new Date(contact.capturedAt).toLocaleDateString(locale)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
              <h2 className="text-sm font-semibold">{t('dashboard.topLinks')}</h2>

              {analytics.topLinks.length === 0 ? (
                <p className="mt-4 text-sm text-neutral-500">{t('dashboard.noLinkClicks')}</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {analytics.topLinks.map((link) => (
                    <li key={link.linkId} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm">
                        {link.label ?? t(`cards.links.types.${link.type}`)}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {link.clicks}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/*
            توزيع نقاط التواصل (§10.4).

            يظهر فقط حين يوجد إسناد فعلي: قسم فارغ يوحي بأن القياس
            معطّل، بينما الحقيقة أن كل الزيارات جاءت من روابط مُشارَكة
            مباشرة — وهي حالة طبيعية لا خلل.
          */}
          {analytics.sources.length > 0 ? (
            <section className="mt-4 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
              <h2 className="text-sm font-semibold">{t('dashboard.bySource')}</h2>
              <ul className="mt-4 space-y-3">
                {analytics.sources.map((entry) => (
                  <li key={entry.source} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{t(`dashboard.sources.${entry.source}`)}</span>
                    <span className="shrink-0 font-medium tabular-nums">{entry.views}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {analytics.cards.length > 1 ? (
            <section className="mt-4 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
              <h2 className="text-sm font-semibold">{t('dashboard.byCard')}</h2>
              <ul className="mt-4 space-y-3">
                {analytics.cards.map((card) => (
                  <li key={card.cardId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{card.fullName}</span>
                    <span className="shrink-0 text-neutral-500 tabular-nums">
                      {t('dashboard.cardSummary', {
                        views: card.views,
                        contacts: card.formSubmits,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
