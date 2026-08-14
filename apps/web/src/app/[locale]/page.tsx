import { getTranslations } from 'next-intl/server';
import { Link } from '../../i18n/routing';
import { auth0 } from '../../lib/auth0';

export default async function HomePage() {
  const t = await getTranslations();
  const session = await auth0.getSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6">
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
