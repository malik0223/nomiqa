import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
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
  await params;
  const { ref, status } = await searchParams;
  const t = await getTranslations();

  if (!ref) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-16 text-center sm:px-8">
        <h1 className="font-display text-xl font-bold tracking-tight">{t('billing.returnMissingRef')}</h1>
        <Link href="/billing" className="mt-6 inline-block text-primary hover:underline">
          {t('billing.backToBilling')}
        </Link>
      </main>
    );
  }

  if (status === 'cancel') {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-16 text-center sm:px-8">
        <h1 className="font-display text-xl font-bold tracking-tight">{t('billing.returnCanceled')}</h1>
        <p className="mt-3 text-sm text-muted">
          {t('billing.returnCanceledHint')}
        </p>
        <Link href="/billing" className="mt-6 inline-block text-primary hover:underline">
          {t('billing.backToBilling')}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-16 text-center sm:px-8">
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
