import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { ApiError } from '../../../../lib/api-client';
import { auth0 } from '../../../../lib/auth0';
import {
  activeOrganizationId,
  fetchCard,
  fetchTemplates,
  publicCardUrl,
} from '../../../../lib/cards';
import { fetchWalletAvailability } from '../../../../lib/presence';
import { CardEditor } from './card-editor';

export default async function CardEditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  const organizationId = await activeOrganizationId();

  try {
    const [card, templates, walletAvailability] = await Promise.all([
      fetchCard(organizationId, id),
      fetchTemplates(organizationId),
      // فشلها لا يمنع المحرر: المحفظة إضافة على البطاقة لا شرط لتحريرها،
      // وسقوطها إلى «غير متاح» يخفي الأزرار ولا يعطّل الشاشة.
      fetchWalletAvailability(organizationId).catch(() => ({ apple: false, google: false })),
    ]);

    return (
      <CardEditor
        card={card}
        templates={templates}
        publicUrl={publicCardUrl(card.slug)}
        uiLocale={locale}
        walletAvailability={walletAvailability}
      />
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('errors.generic')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">
          {error instanceof ApiError ? error.message : t('errors.generic')}
        </p>
      </main>
    );
  }
}
