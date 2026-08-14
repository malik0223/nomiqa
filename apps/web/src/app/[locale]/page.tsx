import { getTranslations } from 'next-intl/server';
import { Link } from '../../i18n/routing';
import { auth0 } from '../../lib/auth0';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const t = await getTranslations();
  const session = await auth0.getSession();
  const { auth_error: authError } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6">
      {authError ? (
        <div
          role="alert"
          className="w-full rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {t('errors.authFailed')} <code className="font-mono">{authError}</code>
        </div>
      ) : null}

      <h1 className="text-4xl font-bold tracking-tight">{t('marketing.title')}</h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-400">{t('marketing.subtitle')}</p>

      {session ? (
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t('common.dashboard')}
          </Link>
          <a
            href="/auth/logout"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('common.signOut')}
          </a>
        </div>
      ) : (
        <a
          href="/auth/login"
          className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700"
        >
          {t('marketing.cta')}
        </a>
      )}
    </main>
  );
}
