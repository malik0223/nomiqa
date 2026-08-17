import { Wordmark, buttonClasses } from '@nomiqa/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="text-fg">
        <Wordmark showText={false} size="lg" />
      </span>

      <div>
        <p className="nq-num font-display text-5xl font-bold tracking-tight text-accent">404</p>
        <h1 className="mt-3 font-display text-lg font-bold tracking-tight">{t('errors.notFound')}</h1>
      </div>

      <Link href="/" className={buttonClasses({ variant: 'secondary' })}>
        {t('common.appName')}
      </Link>
    </main>
  );
}
