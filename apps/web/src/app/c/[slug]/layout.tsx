import { fetchPublicCard } from '@/lib/cards';
import '../../globals.css';

/**
 * تخطيط جذر مستقل للبطاقة العامة.
 *
 * منفصل عن تخطيط التطبيق (`[locale]`) عمداً، ولثلاثة أسباب:
 *  1. لا يحمّل مزوّد الترجمة ولا أي حالة جلسة — الصفحة تُفتح لزائر
 *     مجهول ويجب أن تصل بأقل JavaScript ممكن (§7.6).
 *  2. لغة الصفحة لغة **البطاقة** لا لغة واجهة الزائر، وهما منفصلتان
 *     تماماً في هذه المنصة (§4.8).
 *  3. الوضع الداكن يتبع اختيار صاحب البطاقة لا تفضيل جهاز الزائر.
 */
export default async function PublicCardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // نفس الاستدعاء الموجود في الصفحة: Next يوحّد طلبات fetch المتطابقة
  // داخل الطلب الواحد، فلا يتكرر الجلب فعلياً.
  const card = await fetchPublicCard(slug);

  // **لا `notFound()` هنا.** استدعاؤها من تخطيط جذر يتخطى
  // `not-found.tsx` المجاور — لا تخطيط أعلى يحتضنها — فتصعد إلى حدّ
  // الخطأ العام وتعود الاستجابة 500 بدل 404. البطاقة المفقودة تعالجها
  // الصفحة، ويكتفي التخطيط بغلاف محايد.
  const locale = card?.snapshot.defaultLocale === 'en' ? 'en' : 'ar';
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const scheme = card?.snapshot.theme.colorScheme ?? 'system';
  const themeClass = scheme === 'dark' ? 'theme-dark' : scheme === 'light' ? 'theme-light' : '';

  return (
    <html lang={locale} dir={dir} className={themeClass} suppressHydrationWarning>
      {/*
        خلفية رمادية خفيفة لا بيضاء: البطاقة نفسها بيضاء، وجعل الصفحة
        بيضاء مثلها يذيب حوافّها فتفقد كونها **بطاقة**. هذا هو الفرق
        الوحيد بين صفحة ويب وصورة شيء يُسلَّم باليد.
      */}
      <body className="min-h-screen bg-neutral-100 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50">
        {children}
      </body>
    </html>
  );
}
