import type { InvitationPreview } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ApiError, apiFetch } from '../../../../lib/api-client';
import { auth0 } from '../../../../lib/auth0';
import { AcceptButton } from './accept-button';

interface PageProps {
  params: Promise<{ locale: string; token: string }>;
}

/**
 * صفحة قبول الدعوة (§9.2).
 *
 * تتطلب تسجيل دخول ولا تقبل زائراً مجهولاً: القبول ينشئ عضوية لحساب
 * بعينه. من ليس مسجّلاً يُوجَّه إلى الدخول ثم يعود إلى هنا — الرابط
 * محفوظ في `returnTo`.
 *
 * تطابق البريد شرط في الخادم، ويُعرض هنا **قبل** الضغط: من فتح دعوة
 * أُرسلت لبريد آخر يجب أن يعرف السبب لا أن يضغط ويُرفض.
 */
export default async function InvitationPage({ params }: PageProps) {
  const { locale, token } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/auth/login?returnTo=${encodeURIComponent(`/${locale}/invitations/${token}`)}`);
  }

  let preview: InvitationPreview;

  try {
    preview = await apiFetch<InvitationPreview>(`/invitations/token/${token}`);
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 404
        ? t('invitations.notFound')
        : error instanceof ApiError
          ? error.message
          : t('errors.generic');

    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-xl font-bold">{t('invitations.title')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">{message}</p>
      </main>
    );
  }

  const expired = new Date(preview.expiresAt) <= new Date();

  return (
    <main className="mx-auto max-w-lg px-6 py-20 text-center">
      <h1 className="text-2xl font-bold">{t('invitations.heading')}</h1>
      <p className="mt-3 text-lg">{preview.organizationName}</p>

      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        {t('invitations.asRole', { role: t(`team.roles.${preview.roleKey}`) })}
        {preview.jobTitle ? ` · ${preview.jobTitle}` : ''}
      </p>

      {expired ? (
        <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {t('invitations.expired')}
        </p>
      ) : !preview.emailMatches ? (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {t('invitations.emailMismatch')}
        </p>
      ) : (
        <div className="mt-8">
          <AcceptButton
            token={token}
            locale={locale}
            labels={{ accept: t('invitations.accept'), processing: t('common.saving') }}
          />
        </div>
      )}
    </main>
  );
}
