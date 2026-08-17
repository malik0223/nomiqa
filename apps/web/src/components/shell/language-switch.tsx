'use client';

import { Icon, cn } from '@nomiqa/ui';
import { useParams } from 'next/navigation';
import { Link, usePathname } from '../../i18n/routing';

/**
 * مبدّل لغة الواجهة.
 *
 * ينقل المستخدم إلى **نفس الصفحة** باللغة الأخرى لا إلى الجذر:
 * من يبدّل اللغة وهو داخل محرر بطاقة يريد المحرر بالعربية، لا أن
 * يبدأ من لوحة التحكم من جديد.
 *
 * تنبيه (§4.8): هذه لغة الواجهة وحدها ولا علاقة لها بلغة محتوى
 * البطاقة المنشورة.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const pathname = usePathname();
  const params = useParams();
  const current = typeof params?.locale === 'string' ? params.locale : 'ar';
  const next = current === 'ar' ? 'en' : 'ar';

  return (
    <Link
      href={pathname}
      locale={next}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5',
        'text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg',
        className,
      )}
    >
      <Icon name="languages" size={14} />
      {next === 'en' ? 'English' : 'العربية'}
    </Link>
  );
}
