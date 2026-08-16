import type { ChangeRequestSummary, Paginated } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '../../../i18n/routing';
import { ApiError } from '../../../lib/api-client';
import { auth0 } from '../../../lib/auth0';
import { activeOrganizationId } from '../../../lib/cards';
import { fetchChangeRequests, fetchMyChangeRequests } from '../../../lib/team';
import { MyRequests } from './my-requests';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}

/**
 * طابور الموافقات (§9.3).
 *
 * قسمان: ما ينتظر مراجعتي، وما قدّمته أنا. الثاني متاح لكل موظف بلا
 * صلاحية موافقة — من أرسل طلباً يحتاج أن يعرف مصيره، وإخفاؤه خلف
 * صلاحية المراجعة كان سيتركه ينتظر بلا خبر.
 */
export default async function ApprovalsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { status } = await searchParams;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  const organizationId = await activeOrganizationId();

  const mine = await fetchMyChangeRequests(organizationId).catch(() => [] as ChangeRequestSummary[]);

  // قائمة المراجعة تفشل بـ403 لمن لا يملك صلاحية الموافقة — وهذه حالة
  // متوقعة لا خطأ: الموظف العادي يفتح الصفحة ليرى طلباته هو.
  let queue: Paginated<ChangeRequestSummary> | null = null;
  let canReview = true;

  try {
    queue = await fetchChangeRequests(organizationId, status ?? 'pending');
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      canReview = false;
    } else {
      throw error;
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-bold">{t('approvals.title')}</h1>

      {canReview && queue ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t('approvals.pendingReview')}</h2>

          {queue.data.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">{t('approvals.queueEmpty')}</p>
          ) : (
            <ul className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {queue.data.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <Link
                      href={`/approvals/${request.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {request.requestedByName ?? '—'}
                    </Link>
                    <p className="text-xs text-neutral-500">
                      /{request.cardSlug} · {request.changedFields.join('، ')}
                    </p>
                  </div>

                  {/* «غير قابل للتطبيق» تحذير لا خطأ: البطاقة تغيّرت
                      بعد الطلب، والموافقة عليه ستُرفض بـ409. */}
                  {!request.applicable ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {t('approvals.stale')}
                    </span>
                  ) : null}

                  <span className="text-xs text-neutral-400">
                    {new Date(request.createdAt).toLocaleDateString(locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t('approvals.myRequests')}</h2>
        <MyRequests
          requests={mine}
          locale={locale}
          labels={{
            empty: t('approvals.noRequests'),
            withdraw: t('approvals.withdraw'),
            statusLabel: {
              pending: t('approvals.status.pending'),
              approved: t('approvals.status.approved'),
              rejected: t('approvals.status.rejected'),
              withdrawn: t('approvals.status.withdrawn'),
              stale: t('approvals.status.stale'),
            },
          }}
        />
      </section>
    </main>
  );
}
