import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

/**
 * لغة الواجهة فقط.
 *
 * تنبيه معماري (§4.8): هذا منفصل تماماً عن **لغة محتوى البطاقة**.
 * قد يستخدم الموظف اللوحة بالعربية وينشر بطاقة بلغتين.
 * لا تربط الاثنين في أي مكان.
 */
export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  localePrefix: 'always',
});

export type AppLocale = (typeof routing.locales)[number];

/** حارس نوع للتحقق من أن قيمة المسار لغة مدعومة فعلاً. */
export function isAppLocale(value: string | undefined): value is AppLocale {
  return value !== undefined && (routing.locales as readonly string[]).includes(value);
}

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
