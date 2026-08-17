import { Alert, CardRenderer, Icon, Wordmark, buttonClasses, type IconName } from '@nomiqa/ui';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/marketing/site-header';
import { Link } from '@/i18n/routing';
import { auth0 } from '@/lib/auth0';
import { sampleSnapshot, sampleTemplate } from '@/lib/sample-data';

const FEATURES: { key: string; icon: IconName }[] = [
  { key: 'card', icon: 'card' },
  { key: 'capture', icon: 'contacts' },
  { key: 'presence', icon: 'nfc' },
  { key: 'analytics', icon: 'analytics' },
  { key: 'team', icon: 'team' },
  { key: 'events', icon: 'events' },
];

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();
  const session = await auth0.getSession();
  const { auth_error: authError } = await searchParams;

  return (
    <>
      <SiteHeader locale={locale} signedIn={Boolean(session)} />

      <main>
        {/* ---------- البطل ---------- */}
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20">
          {authError ? (
            <Alert tone="danger" className="mb-10" title={t('errors.authFailed')}>
              <code className="font-mono text-xs" dir="ltr">
                {authError}
              </code>
            </Alert>
          ) : null}

          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div className="min-w-0">
              <p className="mb-5 flex items-center gap-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-accent">
                <span className="h-px w-8 bg-accent-line" aria-hidden="true" />
                {t('marketing.eyebrow')}
              </p>

              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight text-fg sm:text-5xl lg:text-[3.25rem]">
                {t('marketing.headline')}
              </h1>

              <p className="mt-6 max-w-xl text-base leading-8 text-muted sm:text-lg">
                {t('marketing.lede')}
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                {session ? (
                  <Link
                    href="/dashboard"
                    className={buttonClasses({ variant: 'primary', size: 'lg' })}
                  >
                    {t('common.dashboard')}
                  </Link>
                ) : (
                  <a href="/auth/login" className={buttonClasses({ variant: 'primary', size: 'lg' })}>
                    {t('marketing.cta')}
                  </a>
                )}

                <Link href="/guide" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
                  {t('marketing.ctaSecondary')}
                </Link>
              </div>

              <p className="mt-7 flex items-start gap-2 text-[0.8125rem] leading-6 text-faint">
                <Icon name="shield" size={15} className="mt-0.5" />
                {t('marketing.proof')}
              </p>
            </div>

            {/* البطاقة نفسها هي البطل: أصدق ما يُعرض لمنتج بديل عن
                بطاقة مطبوعة هو البطاقة، محاطة بعلامات القصّ التي يضعها
                الطابع على اللوح قبل القطع. */}
            <div className="flex justify-center lg:justify-end">
              <figure className="w-full max-w-sm">
                <div className="nq-crop">
                  <div className="theme-light overflow-hidden rounded-2xl border border-line shadow-float">
                    <CardRenderer
                      snapshot={sampleSnapshot}
                      template={sampleTemplate}
                      locale={locale}
                    />
                  </div>
                </div>

                <figcaption
                  className="mt-8 text-center font-mono text-xs text-faint"
                  dir="ltr"
                  style={{ unicodeBidi: 'isolate' }}
                >
                  nomiqa.om/sara-almamari
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ---------- ما تفعله المنصّة ---------- */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature, index) => (
                <li
                  key={feature.key}
                  className={[
                    'border-line py-9 sm:px-7',
                    // الفواصل خطوط في الشبكة لا إطارات حول كل عنصر:
                    // الإطار يحوّل الجدول إلى ستّ بطاقات متنافسة.
                    index > 0 ? 'border-t sm:border-t-0' : '',
                    index >= 2 ? 'sm:border-t' : '',
                    'sm:[&:nth-child(2n)]:border-s lg:[&:nth-child(2n)]:border-s-0',
                    'lg:[&:nth-child(3n+2)]:border-s lg:[&:nth-child(3n)]:border-s',
                    'lg:[&:nth-child(n+4)]:border-t',
                  ].join(' ')}
                >
                  <Icon name={feature.icon} size={20} className="text-accent" />
                  <h2 className="mt-4 font-display text-base font-semibold tracking-tight text-fg">
                    {t(`marketing.features.${feature.key}.title`)}
                  </h2>
                  <p className="mt-2.5 text-sm leading-7 text-muted">
                    {t(`marketing.features.${feature.key}.body`)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- الخطوات ----------
            مرقّمة لأنها تسلسل فعلي: لا تُشارَك بطاقة قبل إنشائها ولا
            تُقاس قبل مشاركتها. الترقيم هنا معلومة لا زينة. */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="font-display text-2xl font-bold tracking-tight text-fg">
            {t('marketing.steps.title')}
          </h2>

          <ol className="mt-9 grid gap-8 sm:grid-cols-3 sm:gap-10">
            {(['one', 'two', 'three'] as const).map((step, index) => (
              <li key={step}>
                <div className="flex items-center gap-3">
                  <span className="nq-num font-display text-3xl font-bold leading-none text-accent">
                    {index + 1}
                  </span>
                  <span className="h-px flex-1 bg-accent-line/35" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold text-fg">
                  {t(`marketing.steps.${step}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-7 text-muted">
                  {t(`marketing.steps.${step}.body`)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8">
          <span className="text-fg">
            <Wordmark locale={locale} size="sm" />
          </span>

          <div className="flex items-center gap-5 text-[0.8125rem] text-muted">
            <Link href="/guide" className="transition-colors hover:text-fg">
              {t('guide.title')}
            </Link>
            <a href="/auth/login" className="transition-colors hover:text-fg">
              {t('common.signIn')}
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
