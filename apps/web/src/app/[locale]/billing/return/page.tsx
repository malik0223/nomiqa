import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '../../../../i18n/routing';
import { auth0 } from '../../../../lib/auth0';
import { PaymentConfirmation } from './payment-confirmation';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string; status?: string }>;
}

/**
 * صفحة العودة من بوابة الدفع.
 *
 * **لا تصدّق `status` في الرابط إطلاقاً.** من يفتح هذا المسار يدوياً
 * بـ`status=success` لا يُفعّل شيئاً: الصفحة تستدعي تأكيداً خادمياً
 * يستعلم البوابة بمفاتيحنا، والنتيجة هي ما يُعرض.
 *
 * `status` يُستخدم لغرض واحد: تمييز «ألغى العميل بنفسه» عن «عاد بعد
 * دفع»، فنعرض للأول رسالة هادئة بدل انتظار تأكيد لن يأتي.
 */
export default async function BillingReturnPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { ref, status } = await searchParams;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  if (!ref) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-xl font-bold">{t('billing.returnMissingRef')}</h1>
        <Link href="/billing" className="mt-6 inline-block text-brand-600 hover:underline">
          {t('billing.backToBilling')}
        </Link>
      </main>
    );
  }

  if (status === 'cancel') {
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-xl font-bold">{t('billing.returnCanceled')}</h1>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          {t('billing.returnCanceledHint')}
        </p>
        <Link href="/billing" className="mt-6 inline-block text-brand-600 hover:underline">
          {t('billing.backToBilling')}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-20 text-center">
      <PaymentConfirmation
        reference={ref}
        labels={{
          checking: t('billing.returnChecking'),
          paid: t('billing.returnPaid'),
          pending: t('billing.returnPending'),
          failed: t('billing.returnFailed'),
          retry: t('common.retry'),
          back: t('billing.backToBilling'),
        }}
      />
    </main>
  );
}
