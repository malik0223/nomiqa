import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { auth0 } from '@/lib/auth0';
import { demoSession, isDemoMode } from '@/lib/demo/fixtures';

/**
 * تخطيط الشاشات المُصادَقة.
 *
 * حارس الجلسة هنا لا في كل صفحة: صفحة تنسى الحارس تسرّب واجهتها
 * لغير مسجَّل، وتكرار الفحص عشرين مرة يجعل النسيان مسألة وقت.
 * الصفحة العامة للبطاقة ونموذج قبول الدعوة يعيشان خارج هذه
 * المجموعة، فلا يمسّهما هذا الشرط.
 *
 * الاسم والبريد يأتيان من الجلسة لا من `/me`: الشريط الجانبي يظهر
 * في كل شاشة، وربطه بنداء API يعني أن تعطّل الـAPI يمحو التنقّل
 * كله لا القسم المعتمد عليه فقط.
 */
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // وضع العرض يتخطى الجلسة لأن كل ما تحته بيانات ثابتة مُختلَقة —
  // لا وصول إلى مستخدم ولا إلى قاعدة بيانات. راجع lib/demo/fixtures.
  const session = isDemoMode() ? demoSession : await auth0.getSession();

  if (!session) {
    redirect(`/${locale}`);
  }

  return (
    <AppShell
      locale={locale}
      userName={session.user.name ?? session.user.email ?? ''}
      userEmail={session.user.email ?? ''}
    >
      {children}
    </AppShell>
  );
}
