import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Icon, Wordmark } from '@nomiqa/ui';
import { ApiError } from '@/lib/api-client';
import { auth0 } from '@/lib/auth0';
import { fetchPlatformTotals } from '@/lib/admin';
import { AdminNav } from './admin-nav';

/**
 * لوحة إدارة المنصة.
 *
 * **خارج تخطيط `(app)` عمداً.** الشريط الجانبي للمؤسسة واحد للجميع
 * بقرار موثّق في `nav-items.ts`، وإضافة «إدارة المنصة» إليه كانت
 * ستعلن وجود سطح إداري لكل مستأجر ثم ترفضه — وهو ما يمنعه
 * `PlatformAdminGuard` الذي يردّ رسالة عامة كي لا يؤكد وجود المسارات.
 *
 * لذلك: `notFound()` لا `redirect()` عند الرفض. من ليس مسؤول منصة
 * يرى صفحة غير موجودة، تماماً كما يرى الـAPI.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  // نداء واحد يخدم غرضين: التحقق من الصلاحية، وأرقام الترويسة.
  // فحصٌ منفصل كان يعني طلبين لنفس الحقيقة.
  try {
    await fetchPlatformTotals();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3.5 sm:px-8">
          <Wordmark size="sm" locale={locale} />

          <span className="flex items-center gap-1.5 rounded-full border border-accent-line px-2.5 py-1 text-[0.6875rem] font-medium text-accent">
            <Icon name="shield" size={13} />
            {t('admin.badge')}
          </span>

          <a
            href={`/${locale}/dashboard`}
            className="ms-auto flex items-center gap-1.5 text-[0.8125rem] text-muted hover:text-fg"
          >
            <Icon name="chevronStart" size={14} className="rtl:-scale-x-100" />
            {t('admin.backToApp')}
          </a>
        </div>
      </header>

      <AdminNav locale={locale} />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
