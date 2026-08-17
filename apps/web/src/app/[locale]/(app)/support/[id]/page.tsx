import type { TicketDetail } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { ApiError } from '@/lib/api-client';
import { fetchTicket } from '@/lib/billing';
import { activeOrganizationId } from '@/lib/cards';
import { ReplyForm } from './reply-form';
import { formatDateTime } from '@/lib/format';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * محادثة تذكرة دعم.
 *
 * الرسائل الداخلية لفريق المنصة **لا تصل إلى هنا أصلاً**: الخادم
 * يصفّيها قبل الإرسال، فلا يُعتمد على مكوّن واجهة يتذكر إخفاءها.
 */
export default async function TicketPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations();

  let ticket: TicketDetail;

  try {
    const organizationId = await activeOrganizationId();
    ticket = await fetchTicket(organizationId, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/support" className="text-sm text-primary hover:underline">
        ← {t('support.title')}
      </Link>

      <header className="mt-6">
        <h1 className="font-display text-xl font-bold tracking-tight">{ticket.subject}</h1>
        <p className="mt-1 text-sm text-faint">
          {t(`support.categories.${ticket.category}`)} · {t(`support.statuses.${ticket.status}`)}
        </p>
      </header>

      <ol className="mt-8 space-y-4">
        {ticket.messages.map((message) => (
          <li
            key={message.id}
            className={`rounded-xl border p-4 ${
              message.authorType === 'platform'
                ? 'border-accent-line/50 bg-accent-soft/30'
                : 'border-line'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{message.authorName ?? '—'}</span>
              <time className="text-xs text-faint">
                {formatDateTime(message.createdAt, locale)}
              </time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
          </li>
        ))}
      </ol>

      {ticket.status !== 'closed' ? (
        <ReplyForm
          ticketId={ticket.id}
          labels={{
            body: t('support.reply'),
            submit: t('support.send'),
            sending: t('common.saving'),
          }}
        />
      ) : null}
    </main>
  );
}
