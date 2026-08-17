'use client';

import { Icon, Wordmark, cn } from '@nomiqa/ui';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '../../i18n/routing';
import { accountItems, isActivePath, navGroups, type NavItem } from './nav-items';

/**
 * شريط التنقل الجانبي.
 *
 * العنصر النشط يُعلَّم بشريط ذهبي رفيع على حافة البدء لا بخلفية
 * ممتلئة: الخلفية الممتلئة تتنافس بصرياً مع الفعل الأساسي في
 * الصفحة، والشريط يقرأه المستخدم كعلامة مكان لا كزرّ.
 */
export function SidebarContent({
  locale,
  userName,
  userEmail,
  onNavigate,
}: {
  locale: string;
  userName: string;
  userEmail: string;
  /** يُستدعى بعد اختيار وجهة — يغلق الدرج على الجوال. */
  onNavigate?: () => void;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  const renderItem = (item: NavItem) => {
    const active = isActivePath(pathname, item.href);

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'group relative flex items-center gap-3 rounded-md py-2 pe-3 ps-3.5 text-[0.8125rem] font-medium transition-colors',
            active
              ? 'bg-surface-2 text-fg'
              : 'text-muted hover:bg-surface-2/60 hover:text-fg',
          )}
        >
          {/* علامة المكان: شريط ذهبي بارتفاع النصّ على حافة البدء. */}
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-y-1.5 start-0 w-0.5 rounded-full transition-opacity',
              active ? 'bg-accent-line opacity-100' : 'opacity-0',
            )}
          />
          <Icon
            name={item.icon}
            size={17}
            className={active ? 'text-accent' : 'text-faint group-hover:text-muted'}
          />
          <span className="truncate">{t(item.labelKey)}</span>
        </Link>
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
        <Link href="/dashboard" onClick={onNavigate} className="text-fg">
          <Wordmark locale={locale} />
        </Link>
      </div>

      <nav aria-label={t('nav.primary')} className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.key} className="mb-5 last:mb-0">
            <p className="mb-1.5 px-3.5 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-faint">
              {t(`nav.groups.${group.key}`)}
            </p>
            <ul className="flex flex-col gap-0.5">{group.items.map(renderItem)}</ul>
          </div>
        ))}

        <div className="my-4 h-px bg-line" />

        <ul className="flex flex-col gap-0.5">{accountItems.map(renderItem)}</ul>
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <div className="rounded-md bg-surface-2 p-3">
          <p className="truncate text-[0.8125rem] font-medium text-fg">{userName}</p>
          <p className="truncate text-xs text-muted" dir="ltr" style={{ unicodeBidi: 'isolate' }}>
            {userEmail}
          </p>
          <a
            href="/auth/logout"
            className="mt-2.5 inline-flex items-center gap-2 text-xs font-medium text-muted transition-colors hover:text-danger-500"
          >
            <Icon name="logout" size={14} />
            {t('common.signOut')}
          </a>
        </div>
      </div>
    </div>
  );
}
