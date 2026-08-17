import type { TicketSummary } from '@nomiqa/contracts';
import { PageHeader } from '@nomiqa/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ApiError } from '@/lib/api-client';
import { fetchTickets } from '@/lib/billing';
import { activeOrganizationId } from '@/lib/cards';
import { NewTicketForm } from './new-ticket-form';
import { formatDate } from '@/lib/format';

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

  let tickets: TicketSummary[];

  try {
    const organizationId = await activeOrganizationId();
    tickets = await fetchTickets(organizationId);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <PageHeader eyebrow={t('nav.account')} title={t('support.title')} />
        <p className="mt-4 text-muted">{message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader eyebrow={t('nav.account')} title={t('support.title')} />

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('support.newTicket')}</h2>
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

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('support.yourTickets')}</h2>

        {tickets.length === 0 ? (
          <p className="mt-3 text-sm text-faint">{t('support.noTickets')}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Link
                  href={`/support/${ticket.id}`}
                  className="flex-1 truncate font-medium text-primary hover:underline"
                >
                  {ticket.subject}
                </Link>
                <span className="text-xs text-faint">
                  {t(`support.statuses.${ticket.status}`)}
                </span>
                <span className="text-xs text-faint">
                  {formatDate(ticket.updatedAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
