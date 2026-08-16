import type { TicketSummary } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '../../../i18n/routing';
import { ApiError } from '../../../lib/api-client';
import { auth0 } from '../../../lib/auth0';
import { fetchTickets } from '../../../lib/billing';
import { activeOrganizationId } from '../../../lib/cards';
import { NewTicketForm } from './new-ticket-form';

interface PageProps {
  params: Promise<{ locale: string }>;
}

/**
 * تذاكر الدعم (§9.5).
 *
 * متاحة للمؤسسة المعلَّقة أيضاً: الاعتراض على التعليق يجري عبر تذكرة،
 * وقفلها كان سيترك العميل بلا وسيلة اتصال داخل المنتج.
 */
export default async function SupportPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  let tickets: TicketSummary[];

  try {
    const organizationId = await activeOrganizationId();
    tickets = await fetchTickets(organizationId);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('support.title')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">{message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">{t('support.title')}</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t('support.newTicket')}</h2>
        <NewTicketForm
          locale={locale}
          labels={{
            subject: t('support.subject'),
            category: t('support.category'),
            priority: t('support.priority'),
            body: t('support.body'),
            submit: t('support.send'),
            sending: t('common.saving'),
            categories: {
              billing: t('support.categories.billing'),
              technical: t('support.categories.technical'),
              abuse: t('support.categories.abuse'),
              feature_request: t('support.categories.feature_request'),
              other: t('support.categories.other'),
            },
            priorities: {
              low: t('support.priorities.low'),
              normal: t('support.priorities.normal'),
              high: t('support.priorities.high'),
              urgent: t('support.priorities.urgent'),
            },
          }}
        />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t('support.yourTickets')}</h2>

        {tickets.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">{t('support.noTickets')}</p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Link
                  href={`/support/${ticket.id}`}
                  className="flex-1 truncate font-medium text-brand-600 hover:underline"
                >
                  {ticket.subject}
                </Link>
                <span className="text-xs text-neutral-500">
                  {t(`support.statuses.${ticket.status}`)}
                </span>
                <span className="text-xs text-neutral-400">
                  {new Date(ticket.updatedAt).toLocaleDateString(locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
