import { getTranslations } from 'next-intl/server';
import type { CardEntitlements, CardSummary } from '@nomiqa/contracts';
import {
  Alert,
  Badge,
  EmptyState,
  Icon,
  PageBody,
  PageHeader,
  Panel,
  buttonClasses,
} from '@nomiqa/ui';
import { ApiError } from '@/lib/api-client';
import { activeOrganizationId, fetchCards, fetchEntitlements, publicCardUrl } from '@/lib/cards';
import { Link } from '@/i18n/routing';
import { CardStatusBadge } from './status-badge';
import { formatDate } from '@/lib/format';

export default async function CardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations();

  let cards: CardSummary[];
  let entitlements: CardEntitlements;

  try {
    const organizationId = await activeOrganizationId();
    [cards, entitlements] = await Promise.all([
      fetchCards(organizationId),
      fetchEntitlements(organizationId),
    ]);
  } catch (error) {
    return (
      <PageBody width="narrow">
        <PageHeader title={t('errors.generic')} />
        <Alert tone="danger">{error instanceof ApiError ? error.message : t('errors.generic')}</Alert>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('nav.groups.identity')}
        title={t('cards.title')}
        description={t('cards.description')}
        actions={
          entitlements.canCreate ? (
            <Link href="/cards/new" className={buttonClasses({ variant: 'primary' })}>
              {t('cards.create')}
            </Link>
          ) : (
            <Badge tone="warning">{t('cards.quotaReached')}</Badge>
          )
        }
      />

      {/* الحصّة معلومة قرار لا حاشية: من بلغ حدّه يحتاج معرفة ذلك قبل
          أن يبدأ بطاقة لن يستطيع حفظها. */}
      <p className="-mt-2 flex items-center gap-2 text-[0.8125rem] text-muted">
        <Icon name="card" size={15} className="text-faint" />
        {t('cards.quota', { used: entitlements.usedCards, max: entitlements.maxCards })}
      </p>

      {cards.length === 0 ? (
        <EmptyState
          icon="card"
          title={t('cards.empty')}
          description={t('cards.emptyHint')}
          action={
            entitlements.canCreate ? (
              <Link href="/cards/new" className={buttonClasses({ variant: 'primary' })}>
                {t('cards.create')}
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.id}>
              <Panel className="flex h-full flex-col justify-between gap-5">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 truncate font-display text-base font-semibold tracking-tight">
                      {card.fullName}
                    </h2>
                    <CardStatusBadge
                      status={card.status}
                      hasUnpublishedChanges={card.hasUnpublishedChanges}
                    />
                  </div>

                  {/* الرابط دائماً بالاتجاه اللاتيني حتى داخل صفحة عربية. */}
                  <p
                    className="mt-2 truncate font-mono text-xs text-faint"
                    dir="ltr"
                    style={{ unicodeBidi: 'isolate' }}
                  >
                    {publicCardUrl(card.slug)}
                  </p>

                  <p className="nq-num mt-3 text-xs text-faint">
                    {t('cards.updatedAt', {
                      time: formatDate(card.updatedAt, locale),
                    })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  <Link
                    href={`/cards/${card.id}`}
                    className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                  >
                    {t('cards.edit')}
                  </Link>

                  {card.status === 'published' ? (
                    <a
                      href={`/${card.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                    >
                      {t('cards.viewPublic')}
                    </a>
                  ) : null}
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </PageBody>
  );
}
