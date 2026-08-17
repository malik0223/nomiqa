import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Inter, Noto_Kufi_Arabic } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { themeScript } from '@/components/shell/theme-toggle';
import { isAppLocale, routing } from '@/i18n/routing';
import '../globals.css';

/* ============================================================
   الخطوط
   ------------------------------------------------------------
   خطّ عرض واحد لكلتا اللغتين — Noto Kufi Arabic يحمل محارف
   لاتينية أيضاً — فتبقى شخصية العناوين واحدة عند تبديل اللغة.
   اختيار الكوفي دلالي: «نمِقة» تعني الكتابة الدقيقة، والكوفي أصله
   نقش محفور، وهو ما تفعله المنصّة بالهوية المهنية.

   المتن يتبدّل بحسب اللغة لأن الأمر هنا قراءة لا شخصية: Plex Sans
   Arabic للعربية وInter للإنجليزية، وكلاهما مضبوط لأحجام صغيرة.

   الأحادي للأكواد: الكود القصير للوسم ورقم الفاتورة ومفتاح الـAPI
   تُقرأ محرفاً محرفاً، ولا يجوز أن تتشابه فيها 0 وO.
   ============================================================ */

const display = Noto_Kufi_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--nq-font-display',
  display: 'swap',
});

const bodyArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--nq-font-ar',
  display: 'swap',
});

const bodyLatin = Inter({
  subsets: ['latin'],
  variable: '--nq-font-en',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--nq-font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'نمِقة — بطاقتك المهنية الرقمية',
    template: '%s · نمِقة',
  },
  description: 'أنشئ بطاقتك التعريفية الرقمية، شاركها بلمسة، وتابع من تواصل معك.',
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
    <html
      lang={locale}
      dir={dir}
      className={`${display.variable} ${bodyArabic.variable} ${bodyLatin.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* يُطبَّق الوضع المحفوظ قبل أول رسم — انظر التعليق في
            theme-toggle.tsx. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-canvas text-fg antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
