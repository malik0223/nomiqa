import type { CampaignSummary, CardSummary, OrganizationEntitlements } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ApiError } from '../../../lib/api-client';
import { auth0 } from '../../../lib/auth0';
import { fetchEntitlementsSummary } from '../../../lib/billing';
import { activeOrganizationId, fetchCards } from '../../../lib/cards';
import { fetchCampaigns, publishedCards } from '../../../lib/presence';
import { CampaignsPanel } from './campaigns-panel';

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** شاشة الحملات (§10.4). */
export default async function CampaignsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  let campaigns: CampaignSummary[];
  let cards: CardSummary[];
  let entitlements: OrganizationEntitlements;

  try {
    const organizationId = await activeOrganizationId();

    [campaigns, cards, entitlements] = await Promise.all([
      fetchCampaigns(organizationId).catch(() => [] as CampaignSummary[]),
      fetchCards(organizationId),
      fetchEntitlementsSummary(organizationId),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('campaigns.title')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">{message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">{t('campaigns.title')}</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{t('campaigns.intro')}</p>

      <CampaignsPanel
        campaigns={campaigns}
        cards={publishedCards(cards)}
        available={entitlements.features.includes('campaigns')}
        locale={locale}
        labels={{
          name: t('campaigns.name'),
          card: t('campaigns.card'),
          utmSource: t('campaigns.utmSource'),
          utmMedium: t('campaigns.utmMedium'),
          utmCampaign: t('campaigns.utmCampaign'),
          startsAt: t('campaigns.startsAt'),
          endsAt: t('campaigns.endsAt'),
          create: t('common.add'),
          shareUrl: t('campaigns.shareUrl'),
          copy: t('common.copy'),
          copied: t('common.copied'),
          downloadQr: t('campaigns.downloadQr'),
          report: t('campaigns.report'),
          delete: t('common.delete'),
          deleteConfirm: t('campaigns.deleteConfirm'),
          running: t('campaigns.status.running'),
          scheduled: t('campaigns.status.scheduled'),
          ended: t('campaigns.status.ended'),
          paused: t('campaigns.status.paused'),
          empty: t('campaigns.empty'),
          planLimit: t('campaigns.planLimit'),
          noPublishedCards: t('campaigns.noPublishedCards'),
        }}
      />
    </main>
  );
}
