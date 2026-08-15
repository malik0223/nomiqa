import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { CardEntitlements, CardSummary } from '@nomiqa/contracts';
import { auth0 } from '../../../lib/auth0';
import { ApiError } from '../../../lib/api-client';
import {
  activeOrganizationId,
  fetchCards,
  fetchEntitlements,
  publicCardUrl,
} from '../../../lib/cards';
import { Link } from '../../../i18n/routing';
import { CardStatusBadge } from './status-badge';

export default async function CardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

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
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('errors.generic')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">
          {error instanceof ApiError ? error.message : t('errors.generic')}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('cards.title')}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t('cards.quota', { used: entitlements.usedCards, max: entitlements.maxCards })}
          </p>
        </div>

        {entitlements.canCreate ? (
          <Link
            href="/cards/new"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t('cards.create')}
          </Link>
        ) : (
          <span className="rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-500 dark:bg-neutral-800">
            {t('cards.quotaReached')}
          </span>
        )}
      </header>

      {cards.length === 0 ? (
        <p className="mt-12 text-neutral-600 dark:text-neutral-400">{t('cards.empty')}</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {cards.map((card) => (
            <li
              key={card.id}
              className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{card.fullName}</h2>
                  {/* الرابط دائماً بالاتجاه اللاتيني حتى داخل صفحة عربية. */}
                  <p className="mt-1 truncate font-mono text-xs text-neutral-500" dir="ltr">
                    {publicCardUrl(card.slug)}
                  </p>
                </div>

                <CardStatusBadge
                  status={card.status}
                  hasUnpublishedChanges={card.hasUnpublishedChanges}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <Link
                  href={`/cards/${card.id}`}
                  className="font-medium text-brand-600 hover:underline"
                >
                  {t('cards.edit')}
                </Link>

                {card.status === 'published' ? (
                  <a
                    href={`/${card.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-600 hover:underline dark:text-neutral-400"
                  >
                    {t('cards.viewPublic')}
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
