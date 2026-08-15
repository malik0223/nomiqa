import { getTranslations } from 'next-intl/server';
import { Link } from '../../i18n/routing';

/**
 * صفحة 404 داخل التطبيق.
 *
 * تعيش تحت `[locale]` لا في جذر `app` عمداً: التطبيق بلا تخطيط جذر
 * واحد — لوحة التحكم تحت `[locale]` والبطاقة العامة تحت `c/[slug]`،
 * ولكلٍّ لغته واتجاهه. صفحة 404 في الجذر لا يغلّفها أي تخطيط فيرفضها
 * Next. أي مسار غير معروف يمر بوسيط اللغة فيكتسب بادئة لغة ويصل إلى
 * هنا، والبطاقة العامة لها صفحتها الخاصة في `c/[slug]/not-found.tsx`.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-bold">{t('errors.notFound')}</h1>
      <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
        {t('common.appName')}
      </Link>
    </main>
  );
}
