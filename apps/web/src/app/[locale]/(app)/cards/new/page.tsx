import { PageBody, PageHeader } from '@nomiqa/ui';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { activeOrganizationId, fetchEntitlements, fetchTemplates } from '@/lib/cards';
import { NewCardForm } from './new-card-form';

export default async function NewCardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations();

  const organizationId = await activeOrganizationId();
  const [templates, entitlements] = await Promise.all([
    fetchTemplates(organizationId),
    fetchEntitlements(organizationId),
  ]);

  // الحصة تُفحص هنا أيضاً وليس في الواجهة وحدها: إخفاء الزر ليس منعاً.
  if (!entitlements.canCreate) {
    redirect(`/${locale}/cards`);
  }

  return (
    <PageBody width="narrow">
      <PageHeader
        eyebrow={t('cards.title')}
        title={t('cards.create')}
        description={t('cards.createHint')}
      />

      <NewCardForm templates={templates} locale={locale} />
    </PageBody>
  );
}
