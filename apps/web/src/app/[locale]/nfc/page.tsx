import type { CardSummary, NfcTagSummary, OrganizationEntitlements } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ApiError } from '../../../lib/api-client';
import { auth0 } from '../../../lib/auth0';
import { fetchEntitlementsSummary } from '../../../lib/billing';
import { activeOrganizationId, fetchCards } from '../../../lib/cards';
import { fetchNfcTags, publishedCards } from '../../../lib/presence';
import { TagsPanel } from './tags-panel';

interface PageProps {
  params: Promise<{ locale: string }>;
}

/**
 * شاشة وسوم NFC (§10.2).
 *
 * البطاقات المعروضة للربط **منشورة فقط**: الوسم يُكتب مرة ويُوزّع،
 * وربطه ببطاقة مسودة يعني قطعة معدنية تؤدي إلى صفحة غير موجودة حتى
 * ينشر صاحبها — وقد لا ينشر.
 */
export default async function NfcPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  let tags: NfcTagSummary[];
  let cards: CardSummary[];
  let entitlements: OrganizationEntitlements;

  try {
    const organizationId = await activeOrganizationId();

    [tags, cards, entitlements] = await Promise.all([
      fetchNfcTags(organizationId).catch(() => [] as NfcTagSummary[]),
      fetchCards(organizationId),
      fetchEntitlementsSummary(organizationId),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('nfc.title')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">{message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">{t('nfc.title')}</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{t('nfc.intro')}</p>

      <TagsPanel
        tags={tags}
        cards={publishedCards(cards)}
        available={entitlements.features.includes('nfc_tags')}
        labels={{
          label: t('nfc.label'),
          card: t('nfc.card'),
          unassigned: t('nfc.unassigned'),
          issue: t('nfc.issue'),
          writeUrl: t('nfc.writeUrl'),
          copy: t('common.copy'),
          copied: t('common.copied'),
          scans: t('nfc.scans'),
          never: t('nfc.never'),
          reassign: t('nfc.reassign'),
          detach: t('nfc.detach'),
          revoke: t('nfc.revoke'),
          revokeReason: t('nfc.revokeReason'),
          revokeWithReplacement: t('nfc.revokeWithReplacement'),
          revokeConfirm: t('nfc.revokeConfirm'),
          empty: t('nfc.empty'),
          planLimit: t('nfc.planLimit'),
          noPublishedCards: t('nfc.noPublishedCards'),
          status: {
            unassigned: t('nfc.status.unassigned'),
            active: t('nfc.status.active'),
            revoked: t('nfc.status.revoked'),
          },
        }}
      />
    </main>
  );
}
