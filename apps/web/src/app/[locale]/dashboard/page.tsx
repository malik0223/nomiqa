import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { MeResponse } from '@nomiqa/contracts';
import { auth0 } from '../../../lib/auth0';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { Link } from '../../../i18n/routing';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  let me: MeResponse;
  try {
    me = await apiFetch<MeResponse>('/me');
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');
    const requestId = error instanceof ApiError ? error.requestId : undefined;

    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('errors.generic')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">{message}</p>
        {requestId ? (
          <p className="mt-2 font-mono text-xs text-neutral-500">requestId: {requestId}</p>
        ) : null}
      </main>
    );
  }

  const primary = me.organizations[0];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/cards"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t('dashboard.myCards')}
          </Link>
          <a
            href="/auth/logout"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('common.signOut')}
          </a>
        </div>
      </header>

      <p className="mt-6 text-lg">
        {t('dashboard.welcome', { name: me.user.fullName ?? me.user.email })}
      </p>

      {primary ? (
        <section className="mt-8 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
          <h2 className="text-lg font-semibold">{primary.name}</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-neutral-500">{t('dashboard.orgSlug')}:</dt>
              <dd className="font-mono">{primary.slug}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-neutral-500">{t('dashboard.roles')}:</dt>
              <dd>{primary.roles.join('، ')}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-neutral-500">{t('dashboard.permissions')}:</dt>
              <dd>{primary.permissions.length}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <p className="mt-8 text-neutral-600 dark:text-neutral-400">
          {t('dashboard.noOrganization')}
        </p>
      )}
    </main>
  );
}
