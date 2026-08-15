import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth0 } from '../../../../lib/auth0';
import { activeOrganizationId, fetchEntitlements, fetchTemplates } from '../../../../lib/cards';
import { NewCardForm } from './new-card-form';

export default async function NewCardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

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
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-bold">{t('cards.create')}</h1>
      <p className="mt-2 text-sm text-neutral-500">{t('cards.createHint')}</p>

      <NewCardForm templates={templates} locale={locale} />
    </main>
  );
}
