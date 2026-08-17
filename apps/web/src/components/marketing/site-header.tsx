import { Wordmark, buttonClasses } from '@nomiqa/ui';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitch } from '@/components/shell/language-switch';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { Link } from '@/i18n/routing';

/**
 * ترويسة الصفحات العامة.
 *
 * منفصلة عن هيكل التطبيق عمداً: الزائر غير المسجَّل لا يملك تنقّلاً
 * بين شاشات، فشريط جانبي بعناصر لا يستطيع فتحها إعلان عن أبواب
 * موصدة لا عن منتج.
 */
export async function SiteHeader({
  locale,
  signedIn,
}: {
  locale: string;
  signedIn: boolean;
}) {
  const t = await getTranslations();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="text-fg">
          <Wordmark locale={locale} />
        </Link>

        <div className="flex items-center gap-2">
          <LanguageSwitch className="hidden sm:inline-flex" />
          <ThemeToggle className="hidden sm:inline-flex" />

          {signedIn ? (
            <Link href="/dashboard" className={buttonClasses({ variant: 'primary', size: 'sm' })}>
              {t('common.dashboard')}
            </Link>
          ) : (
            <a href="/auth/login" className={buttonClasses({ variant: 'primary', size: 'sm' })}>
              {t('common.signIn')}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
