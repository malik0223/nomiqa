import { EMAIL_CLIENTS, MEETING_PLATFORMS, SIGNATURE_TEMPLATES } from '@nomiqa/contracts';
import type { CardSummary, SignaturePayload } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ApiError } from '../../../lib/api-client';
import { auth0 } from '../../../lib/auth0';
import { fetchEntitlementsSummary } from '../../../lib/billing';
import { activeOrganizationId, fetchCards } from '../../../lib/cards';
import { fetchSignature, publishedCards } from '../../../lib/presence';
import { BackgroundStudio } from './background-studio';
import { SignatureStudio } from './signature-studio';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cardId?: string }>;
}

/**
 * شاشة التوقيع وخلفيات الاجتماعات (§10.3).
 *
 * البطاقة المنشورة شرط لكليهما: التوقيع يُرسل إلى أطراف خارجيين
 * والخلفية تُعرض في اجتماع، وكلاهما يحمل رابطاً وصورة يجب أن يعملا
 * لمن يراهما — لا لصاحبهما وهو مسجّل الدخول.
 */
export default async function SignaturePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { cardId } = await searchParams;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  let cards: CardSummary[];
  let signature: SignaturePayload | null = null;
  let available = false;
  let backgroundsAvailable = false;
  let message: string | null = null;

  try {
    const organizationId = await activeOrganizationId();

    const [allCards, entitlements] = await Promise.all([
      fetchCards(organizationId),
      fetchEntitlementsSummary(organizationId),
    ]);

    cards = publishedCards(allCards);
    available = entitlements.features.includes('email_signature');
    backgroundsAvailable = entitlements.features.includes('meeting_backgrounds');

    const selected = cards.find((card) => card.id === cardId) ?? cards[0];

    if (available && selected) {
      signature = await fetchSignature(organizationId, selected.id, locale).catch(
        (error: unknown) => {
          message = error instanceof ApiError ? error.message : t('errors.generic');
          return null;
        },
      );
    }
  } catch (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('signature.title')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">
          {error instanceof ApiError ? error.message : t('errors.generic')}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-bold">{t('signature.title')}</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{t('signature.intro')}</p>

      {cards.length > 1 ? (
        <nav className="mt-6 flex flex-wrap gap-2 text-sm">
          {cards.map((card) => (
            <a
              key={card.id}
              href={`/${locale}/signature?cardId=${card.id}`}
              className={
                card.id === (signature?.cardId ?? cards[0]?.id)
                  ? 'rounded-lg bg-neutral-900 px-3 py-1.5 font-medium text-white dark:bg-white dark:text-neutral-900'
                  : 'rounded-lg bg-neutral-100 px-3 py-1.5 font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700'
              }
            >
              {card.fullName}
            </a>
          ))}
        </nav>
      ) : null}

      {!available ? (
        <p className="mt-6 text-sm text-neutral-500">{t('signature.planLimit')}</p>
      ) : cards.length === 0 ? (
        <p className="mt-6 text-sm text-amber-600">{t('signature.noPublishedCards')}</p>
      ) : signature ? (
        <SignatureStudio
          initial={signature}
          labels={{
            template: t('signature.template'),
            showQr: t('signature.showQr'),
            showAvatar: t('signature.showAvatar'),
            showLogo: t('signature.showLogo'),
            showSocialLinks: t('signature.showSocialLinks'),
            accentColor: t('signature.accentColor'),
            disclaimer: t('signature.disclaimer'),
            save: t('common.save'),
            saving: t('common.saving'),
            saved: t('common.saved'),
            preview: t('signature.preview'),
            copyHtml: t('signature.copyHtml'),
            copyText: t('signature.copyText'),
            copied: t('common.copied'),
            enforced: t('signature.enforced'),
            instructions: t('signature.instructions'),
            clients: Object.fromEntries(
              EMAIL_CLIENTS.map((client) => [client, t(`signature.clients.${client}`)]),
            ),
            clientSteps: Object.fromEntries(
              EMAIL_CLIENTS.map((client) => [client, t(`signature.clientSteps.${client}`)]),
            ),
            templateNames: Object.fromEntries(
              SIGNATURE_TEMPLATES.map((key) => [key, t(`signature.templates.${key}`)]),
            ),
          }}
        />
      ) : (
        <p className="mt-6 text-sm text-neutral-600 dark:text-neutral-400">
          {message ?? t('errors.generic')}
        </p>
      )}

      <section className="mt-16 border-t border-neutral-200 pt-10 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">{t('signature.backgrounds')}</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {t('signature.backgroundsIntro')}
        </p>

        {!backgroundsAvailable ? (
          <p className="mt-4 text-sm text-neutral-500">{t('signature.planLimit')}</p>
        ) : signature ? (
          <BackgroundStudio
            cardId={signature.cardId}
            locale={locale}
            labels={{
              platform: t('signature.platform'),
              scheme: t('signature.scheme'),
              light: t('signature.schemeLight'),
              dark: t('signature.schemeDark'),
              showQr: t('signature.showQr'),
              generate: t('signature.generate'),
              download: t('signature.downloadPng'),
              hint: t('signature.backgroundHint'),
              platformNames: Object.fromEntries(
                MEETING_PLATFORMS.map((key) => [key, t(`signature.platforms.${key}`)]),
              ),
            }}
          />
        ) : null}
      </section>
    </main>
  );
}
