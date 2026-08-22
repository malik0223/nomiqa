'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Icon, cn, type IconName } from '@nomiqa/ui';

const TABS: Array<{ segment: string; labelKey: string; icon: IconName }> = [
  { segment: '', labelKey: 'admin.nav.overview', icon: 'dashboard' },
  { segment: '/organizations', labelKey: 'admin.nav.organizations', icon: 'building' },
  { segment: '/plans', labelKey: 'admin.nav.plans', icon: 'billing' },
  { segment: '/flags', labelKey: 'admin.nav.flags', icon: 'settings' },
  { segment: '/audit', labelKey: 'admin.nav.audit', icon: 'shield' },
];

export function AdminNav({ locale }: { locale: string }) {
  const pathname = usePathname();
  const t = useTranslations();
  const base = `/${locale}/admin`;

  return (
    <nav className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 sm:px-8">
        {TABS.map((tab) => {
          const href = `${base}${tab.segment}`;
          // المطابقة التامة للنظرة العامة وحدها، وإلا لظلّت نشطة دائماً.
          const active = tab.segment === '' ? pathname === href : pathname.startsWith(href);

          return (
            <Link
              key={tab.segment}
              href={href}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-[0.8125rem] font-medium transition-colors',
                active
                  ? 'border-accent-line text-accent'
                  : 'border-transparent text-muted hover:text-fg',
              )}
            >
              <Icon name={tab.icon} size={15} />
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
