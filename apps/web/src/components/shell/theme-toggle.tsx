'use client';

import { Icon, cn } from '@nomiqa/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'nq-theme';

/**
 * سكربت يُحقن قبل الرسم الأول.
 *
 * بدونه تُرسم الصفحة بالوضع الفاتح ثم تقفز إلى الداكن بعد تحميل
 * JavaScript — ووميض أبيض في وجه مستخدم اختار الوضع الداكن عيب
 * لا يُغتفر في تطبيق يُفتح ليلاً في قاعة معرض.
 */
export const themeScript = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}');if(m==='dark'||m==='light'){document.documentElement.classList.add('theme-'+m)}}catch(e){}})()`;

function apply(mode: Mode) {
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');

  if (mode !== 'system') {
    root.classList.add(`theme-${mode}`);
    localStorage.setItem(STORAGE_KEY, mode);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations();
  const [mode, setMode] = useState<Mode>('system');

  // القراءة بعد التركيب لا قبله: القيمة تعيش في localStorage الذي لا
  // يوجد على الخادم، وقراءتها أثناء التصيير تكسر المطابقة.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setMode(stored === 'dark' || stored === 'light' ? stored : 'system');
  }, []);

  const options: { value: Mode; icon: 'sun' | 'moon' | 'settings'; label: string }[] = [
    { value: 'light', icon: 'sun', label: t('common.lightMode') },
    { value: 'dark', icon: 'moon', label: t('common.darkMode') },
    { value: 'system', icon: 'settings', label: t('common.systemMode') },
  ];

  return (
    <div
      role="group"
      aria-label={t('nav.theme')}
      className={cn('inline-flex rounded-md border border-line bg-surface-2 p-0.5', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={mode === option.value}
          onClick={() => {
            apply(option.value);
            setMode(option.value);
          }}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-sm transition-colors',
            mode === option.value
              ? 'bg-surface text-fg shadow-sheet'
              : 'text-faint hover:text-muted',
          )}
        >
          <Icon name={option.icon} size={14} />
        </button>
      ))}
    </div>
  );
}
