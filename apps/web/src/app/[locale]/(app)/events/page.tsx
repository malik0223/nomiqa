import type { CardSummary, EventSummary, OrganizationEntitlements } from '@nomiqa/contracts';
import { PageHeader } from '@nomiqa/ui';
import { getTranslations } from 'next-intl/server';
import { ApiError } from '@/lib/api-client';
import { fetchEntitlementsSummary } from '@/lib/billing';
import { activeOrganizationId, fetchCards } from '@/lib/cards';
import { publishedCards } from '@/lib/presence';
import { fetchEvents } from '@/lib/sales';
import { EventsPanel } from './events-panel';

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** شاشة الفعاليات (§11.3). */
export default async function EventsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations();

  let events: EventSummary[];
  let cards: CardSummary[];
  let entitlements: OrganizationEntitlements;

  try {
    const organizationId = await activeOrganizationId();

    [events, cards, entitlements] = await Promise.all([
      fetchEvents(organizationId).catch(() => [] as EventSummary[]),
      fetchCards(organizationId),
      fetchEntitlementsSummary(organizationId),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <PageHeader eyebrow={t('nav.groups.relations')} title={t('events.title')} />
        <p className="mt-4 text-muted">{message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow={t('nav.groups.relations')}
        title={t('events.title')}
        description={t('events.intro')}
      />

      <EventsPanel
        events={events}
        cards={publishedCards(cards)}
        available={entitlements.features.includes('events')}
        locale={locale}
        labels={{
          name: t('events.name'),
          location: t('events.location'),
          startsAt: t('events.startsAt'),
          endsAt: t('events.endsAt'),
          cards: t('events.cards'),
          cardsHint: t('events.cardsHint'),
          qualifiers: t('events.qualifiers'),
          qualifiersHint: t('events.qualifiersHint'),
          addQualifier: t('events.addQualifier'),
          removeQualifier: t('common.delete'),
          qualifierLabel: t('events.qualifierLabel'),
          qualifierType: t('events.qualifierType'),
          qualifierOptions: t('events.qualifierOptions'),
          qualifierOptionsHint: t('events.qualifierOptionsHint'),
          cost: t('events.cost'),
          costHint: t('events.costHint'),
          target: t('events.target'),
          create: t('common.add'),
          report: t('events.report'),
          delete: t('common.delete'),
          deleteConfirm: t('events.deleteConfirm'),
          leads: t('events.leads'),
          empty: t('events.empty'),
          planLimit: t('events.planLimit'),
          noPublishedCards: t('events.noPublishedCards'),
          types: {
            select: t('events.types.select'),
            text: t('events.types.text'),
            boolean: t('events.types.boolean'),
          },
          status: {
            upcoming: t('events.status.upcoming'),
            running: t('events.status.running'),
            ended: t('events.status.ended'),
          },
        }}
      />
    </main>
  );
}
