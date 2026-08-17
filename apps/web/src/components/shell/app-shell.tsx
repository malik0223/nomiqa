'use client';

import { Icon, Wordmark } from '@nomiqa/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from '../../i18n/routing';
import { LanguageSwitch } from './language-switch';
import { SidebarContent } from './sidebar';
import { ThemeToggle } from './theme-toggle';

export interface AppShellProps {
  locale: string;
  userName: string;
  userEmail: string;
  children: ReactNode;
}

/**
 * هيكل التطبيق: شريط جانبي ثابت وترويسة ومنطقة محتوى.
 *
 * الشريط ثابت على الشاشات الكبيرة ودرج على الجوال. الإزاحة
 * بخاصية منطقية (`lg:ms-64`) فينتقل الشريط إلى اليمين في العربية
 * وإلى اليسار في الإنجليزية بلا شرط واحد في الكود.
 */
export function AppShell({ locale, userName, userEmail, children }: AppShellProps) {
  const t = useTranslations();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // الانتقال إلى صفحة جديدة يغلق الدرج. بدون هذا يبقى الدرج مفتوحاً
  // فوق الصفحة الجديدة على الجوال ويبدو التنقّل كأنه لم يحدث.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#nq-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-fg"
      >
        {t('nav.skipToContent')}
      </a>

      {/* الشريط الجانبي — الشاشات الكبيرة */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 border-e border-line lg:block">
        <SidebarContent locale={locale} userName={userName} userEmail={userEmail} />
      </aside>

      {/* الدرج — الجوال */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('nav.close')}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 start-0 w-72 shadow-float">
            <SidebarContent
              locale={locale}
              userName={userName}
              userEmail={userEmail}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="lg:ms-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-canvas/85 px-5 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={t('nav.open')}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:text-fg lg:hidden"
            >
              <Icon name="menu" size={18} />
            </button>

            <span className="text-fg lg:hidden">
              <Wordmark locale={locale} size="sm" />
            </span>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </header>

        <main id="nq-content">{children}</main>
      </div>
    </div>
  );
}
