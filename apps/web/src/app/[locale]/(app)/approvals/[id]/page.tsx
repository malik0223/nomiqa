import type { ChangeRequestDetail } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { ApiError } from '@/lib/api-client';
import { activeOrganizationId } from '@/lib/cards';
import { fetchChangeRequest } from '@/lib/team';
import { ReviewPanel } from './review-panel';
import { formatDate } from '@/lib/format';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * مراجعة طلب تعديل (§9.3).
 *
 * «قبل/بعد» جنباً إلى جنب: المراجع يوافق على **فرق** لا على نموذج
 * كامل، وعرض القيم المقترحة وحدها كان سيجعله يوافق بلا أن يعرف ما
 * الذي يتغير فعلاً.
 */
export default async function ApprovalDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations();

  let request: ChangeRequestDetail;

  try {
    const organizationId = await activeOrganizationId();
    request = await fetchChangeRequest(organizationId, id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }

  const fields = Object.keys(request.payload).filter((key) => key !== 'revision');

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/approvals" className="text-sm text-primary hover:underline">
        ← {t('approvals.title')}
      </Link>

      <header className="mt-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">{request.requestedByName ?? '—'}</h1>
        <p className="mt-1 text-sm text-faint">
          /{request.cardSlug} · {formatDate(request.createdAt, locale)}
        </p>
      </header>

      {!request.applicable ? (
        <p className="mt-4 rounded-lg border border-warning-100 bg-warning-50 px-4 py-3 text-sm text-warning-600 dark:border-amber-800">
          {t('approvals.staleWarning')}
        </p>
      ) : null}

      <section className="mt-8 overflow-x-auto rounded-card border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t('approvals.field')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('approvals.before')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('approvals.after')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {fields.map((field) => (
              <tr key={field}>
                <td className="px-4 py-3 font-medium">{field}</td>
                <td className="px-4 py-3 text-faint">
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                    {stringify(request.currentValues[field])}
                  </pre>
                </td>
                <td className="px-4 py-3">
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                    {stringify(request.payload[field])}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {request.status === 'pending' ? (
        <ReviewPanel
          requestId={request.id}
          labels={{
            approve: t('approvals.approve'),
            reject: t('approvals.reject'),
            note: t('approvals.note'),
            noteRequired: t('approvals.noteRequired'),
            processing: t('common.saving'),
          }}
        />
      ) : (
        <p className="mt-8 text-sm text-faint">
          {t(`approvals.status.${request.status}`)}
          {request.reviewNote ? ` — ${request.reviewNote}` : ''}
        </p>
      )}
    </main>
  );
}

/** يطبع القيمة بلا اقتباس زائد على النصوص القصيرة. */
function stringify(value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}
