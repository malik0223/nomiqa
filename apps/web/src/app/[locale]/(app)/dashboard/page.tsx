import type { AnalyticsOverview, ContactSummary, MeResponse } from '@nomiqa/contracts';
import {
  Alert,
  Badge,
  EmptyState,
  Icon,
  Panel,
  PanelHeader,
  PageBody,
  PageHeader,
  Segmented,
  Stat,
  StatGrid,
  buttonClasses,
} from '@nomiqa/ui';
import { getTranslations } from 'next-intl/server';
import { ApiError, apiFetch } from '@/lib/api-client';
import { activeOrganizationId } from '@/lib/cards';
import { fetchAnalytics, fetchContacts } from '@/lib/contacts';
import { Link } from '@/i18n/routing';
import { ActivityChart } from './activity-chart';
import { formatDate, formatDateTime } from '@/lib/format';

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

  const selected: Range = RANGES.includes(range as Range) ? (range as Range) : '30d';

  let me: MeResponse;
  let analytics: AnalyticsOverview | null = null;
  let recent: ContactSummary[] = [];

  try {
    me = await apiFetch<MeResponse>('/me');
  } catch (error) {
    return (
      <PageBody width="narrow">
        <PageHeader title={t('errors.generic')} />
        <Alert tone="danger">{error instanceof ApiError ? error.message : t('errors.generic')}</Alert>
      </PageBody>
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

  const totalSourceViews = analytics?.sources.reduce((sum, entry) => sum + entry.views, 0) ?? 0;

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('nav.groups.measure')}
        title={t('dashboard.welcome', { name: me.user.fullName ?? me.user.email })}
        description={t('dashboard.description')}
        actions={
          <Link href="/cards" className={buttonClasses({ variant: 'primary' })}>
            {t('dashboard.myCards')}
          </Link>
        }
      />

      {analytics === null ? (
        <Alert tone="warning" title={t('dashboard.analyticsUnavailable')} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              ariaLabel={t('dashboard.activity')}
              active={selected}
              options={RANGES.map((option) => ({
                value: option,
                href: `?range=${option}`,
                label: t(`dashboard.ranges.${option}`),
              }))}
            />

            {/* وقت آخر تجميع معلن عمداً: الأرقام تتأخر دقائق، وإخفاء
                ذلك يجعل صاحب البطاقة يظن أن زيارة للتو ضاعت. */}
            {analytics.updatedAt ? (
              <p className="flex items-center gap-1.5 text-xs text-faint">
                <Icon name="clock" size={13} />
                {t('dashboard.updatedAt', {
                  time: formatDateTime(analytics.updatedAt, locale),
                })}
              </p>
            ) : null}
          </div>

          <StatGrid>
            <Stat
              icon="eye"
              label={t('dashboard.metrics.views')}
              value={analytics.summary.views}
            />
            <Stat
              icon="contacts"
              label={t('dashboard.metrics.uniqueVisitors')}
              value={analytics.summary.uniqueVisitors}
            />
            <Stat
              icon="link"
              label={t('dashboard.metrics.linkClicks')}
              value={analytics.summary.linkClicks}
            />
            <Stat
              icon="download"
              label={t('dashboard.metrics.vcardDownloads')}
              value={analytics.summary.vcardDownloads}
            />
            {/* جهات الاتصال الجديدة هي النتيجة التي تُبرَّر بها المنصّة،
                فهي وحدها المميّزة في الشبكة. */}
            <Stat
              featured
              icon="seal"
              label={t('dashboard.metrics.formSubmits')}
              value={analytics.summary.formSubmits}
            />
            <Stat
              icon="analytics"
              label={t('dashboard.metrics.conversionRate')}
              value={`${analytics.summary.conversionRate}%`}
            />
          </StatGrid>

          <Panel>
            <PanelHeader icon="analytics" title={t('dashboard.activity')} />
            <ActivityChart
              series={analytics.series}
              locale={locale}
              emptyLabel={t('dashboard.noActivity')}
              peakLabel={(value, date) => t('dashboard.peak', { value, date })}
            />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                icon="contacts"
                title={t('dashboard.recentContacts')}
                actions={
                  <Link
                    href="/contacts"
                    className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                  >
                    {t('common.view')}
                  </Link>
                }
              />

              {recent.length === 0 ? (
                <EmptyState className="mt-5" icon="contacts" title={t('contacts.empty')} />
              ) : (
                <ul className="mt-4 divide-y divide-line">
                  {recent.map((contact) => (
                    <li key={contact.id}>
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-primary"
                      >
                        <span className="min-w-0 truncate text-[0.8125rem] font-medium">
                          {contact.fullName}
                        </span>
                        <time
                          dateTime={contact.capturedAt}
                          className="nq-num shrink-0 text-xs text-faint"
                        >
                          {formatDate(contact.capturedAt, locale)}
                        </time>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <PanelHeader icon="link" title={t('dashboard.topLinks')} />

              {analytics.topLinks.length === 0 ? (
                <EmptyState className="mt-5" icon="link" title={t('dashboard.noLinkClicks')} />
              ) : (
                <ul className="mt-4 divide-y divide-line">
                  {analytics.topLinks.map((link) => (
                    <li
                      key={link.linkId}
                      className="flex items-center justify-between gap-3 py-2.5 text-[0.8125rem]"
                    >
                      <span className="min-w-0 truncate">
                        {link.label ?? t(`cards.links.types.${link.type}`)}
                      </span>
                      <span className="nq-num shrink-0 font-medium">{link.clicks}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {/*
            توزيع نقاط التواصل (§10.4).

            يظهر فقط حين يوجد إسناد فعلي: قسم فارغ يوحي بأن القياس
            معطّل، بينما الحقيقة أن كل الزيارات جاءت من روابط مُشارَكة
            مباشرة — وهي حالة طبيعية لا خلل.
          */}
          {analytics.sources.length > 0 ? (
            <Panel>
              <PanelHeader
                icon="nfc"
                title={t('dashboard.bySource')}
                description={t('dashboard.bySourceHint')}
              />

              <ul className="mt-5 flex flex-col gap-3.5">
                {analytics.sources.map((entry) => {
                  const share = totalSourceViews === 0 ? 0 : (entry.views / totalSourceViews) * 100;

                  return (
                    <li key={entry.source}>
                      <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                        <span className="min-w-0 truncate">
                          {t(`dashboard.sources.${entry.source}`)}
                        </span>
                        <span className="nq-num shrink-0 font-medium">{entry.views}</span>
                      </div>
                      {/* الشريط يقيس الحصّة من الزيارات المعروف مصدرها
                          لا من كل الزيارات — انظر تعليق `sources` في
                          العقد. */}
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}

          {analytics.cards.length > 1 ? (
            <Panel>
              <PanelHeader icon="card" title={t('dashboard.byCard')} />
              <ul className="mt-4 divide-y divide-line">
                {analytics.cards.map((card) => (
                  <li
                    key={card.cardId}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[0.8125rem]"
                  >
                    <span className="min-w-0 truncate font-medium">{card.fullName}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone="neutral">
                        <span className="nq-num">{card.views}</span>
                        &nbsp;
                        {t('dashboard.metrics.views')}
                      </Badge>
                      <Badge tone="gold">
                        <span className="nq-num">{card.formSubmits}</span>
                        &nbsp;
                        {t('dashboard.metrics.formSubmits')}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      )}
    </PageBody>
  );
}
