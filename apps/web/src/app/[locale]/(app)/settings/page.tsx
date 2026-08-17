import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@nomiqa/ui';
import type { ConsentStatus, UserProfile } from '@nomiqa/contracts';
import { ApiError, apiFetch } from '@/lib/api-client';
import { ProfileForm } from './profile-form';
import { ConsentToggles } from './consent-toggles';
import { DangerZone } from './danger-zone';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  await params;
  const t = await getTranslations();

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
      <main className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
        <PageHeader eyebrow={t('nav.account')} title={t('settings.title')} />
        <p className="mt-4 text-muted">{message}</p>
        {requestId ? (
          <p className="mt-2 font-mono text-xs text-faint">requestId: {requestId}</p>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader eyebrow={t('nav.account')} title={t('settings.title')} />

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('settings.profile')}</h2>
        <ProfileForm profile={profile} />
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('settings.consents')}</h2>
        <ConsentToggles consents={consents} />
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('settings.yourData')}</h2>
        <DangerZone />
      </section>
    </main>
  );
}
