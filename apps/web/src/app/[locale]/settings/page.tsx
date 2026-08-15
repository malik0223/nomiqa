import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { ConsentStatus, UserProfile } from '@nomiqa/contracts';
import { auth0 } from '../../../lib/auth0';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { ProfileForm } from './profile-form';
import { ConsentToggles } from './consent-toggles';
import { DangerZone } from './danger-zone';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  let profile: UserProfile;
  let consents: ConsentStatus[];

  try {
    [profile, consents] = await Promise.all([
      apiFetch<UserProfile>('/me/profile'),
      apiFetch<ConsentStatus[]>('/me/consents'),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');
    const requestId = error instanceof ApiError ? error.requestId : undefined;

    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">{message}</p>
        {requestId ? (
          <p className="mt-2 font-mono text-xs text-neutral-500">requestId: {requestId}</p>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t('settings.profile')}</h2>
        <ProfileForm profile={profile} />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t('settings.consents')}</h2>
        <ConsentToggles consents={consents} />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t('settings.yourData')}</h2>
        <DangerZone />
      </section>
    </main>
  );
}
