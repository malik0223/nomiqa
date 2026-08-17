import { Alert, PageBody, PageHeader } from '@nomiqa/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api-client';
import { activeOrganizationId, fetchCard, fetchTemplates, publicCardUrl } from '@/lib/cards';
import { fetchWalletAvailability } from '@/lib/presence';
import { CardEditor } from './card-editor';

export default async function CardEditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations();

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
      <PageBody width="narrow">
        <PageHeader title={t('errors.generic')} />
        <Alert tone="danger">
          {error instanceof ApiError ? error.message : t('errors.generic')}
        </Alert>
      </PageBody>
    );
  }
}
