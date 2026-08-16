import type { ChangeRequestDetail } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Link } from '../../../../i18n/routing';
import { ApiError } from '../../../../lib/api-client';
import { auth0 } from '../../../../lib/auth0';
import { activeOrganizationId } from '../../../../lib/cards';
import { fetchChangeRequest } from '../../../../lib/team';
import { ReviewPanel } from './review-panel';

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

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

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
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/approvals" className="text-sm text-brand-600 hover:underline">
        ← {t('approvals.title')}
      </Link>

      <header className="mt-6">
        <h1 className="text-2xl font-bold">{request.requestedByName ?? '—'}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          /{request.cardSlug} · {new Date(request.createdAt).toLocaleDateString(locale)}
        </p>
      </header>

      {!request.applicable ? (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {t('approvals.staleWarning')}
        </p>
      ) : null}

      <section className="mt-8 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t('approvals.field')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('approvals.before')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('approvals.after')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {fields.map((field) => (
              <tr key={field}>
                <td className="px-4 py-3 font-medium">{field}</td>
                <td className="px-4 py-3 text-neutral-500">
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
        <p className="mt-8 text-sm text-neutral-500">
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
