import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { isAppLocale, routing } from '../../i18n/routing';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Nomiqa',
  description: 'Digital Business Card SaaS Platform',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isAppLocale(locale)) {
    notFound();
  }

  // يتيح التصيير الثابت للصفحات التي لا تحتاج بيانات لكل طلب.
  setRequestLocale(locale);
  const messages = await getMessages();

  // الاتجاه يُشتق من اللغة مرة واحدة هنا؛ بقية التطبيق يستخدم
  // الخصائص المنطقية في CSS ولا يفحص الاتجاه يدوياً.
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
