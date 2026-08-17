import { auth0 } from '@/lib/auth0';
import { activeOrganizationId } from '@/lib/cards';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * تنزيل ملف جهات الاتصال.
 *
 * معالج خادمي لا رابط مباشر إلى الـAPI: رمز الوصول لا يصل إلى المتصفح
 * إطلاقاً، فلا يمكن للمتصفح أن يستدعي مسار التصدير بنفسه. هذا المعالج
 * يحمل الرمز، ويعيد الملف كما هو.
 *
 * الصلاحية تُفحص في الـAPI (`contacts:export`) لا هنا: هذه طبقة نقل،
 * والتحقق من الصلاحية في مكانين يعني قاعدتين تتباعدان.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await auth0.getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { token } = await auth0.getAccessToken();
  const organizationId = await activeOrganizationId();

  // نمرّر التصفية كما وصلت: الـAPI يتحقق منها بمخططه، فلا نكرر التحقق.
  const incoming = new URL(request.url).searchParams;
  const query = incoming.toString();

  const response = await fetch(
    `${API_URL}/api/v1/contacts/export${query.length > 0 ? `?${query}` : ''}`,
    {
      headers: { Authorization: `Bearer ${token}`, 'x-organization-id': organizationId },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    return new Response('تعذّر تصدير جهات الاتصال', { status: response.status });
  }

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(await response.text(), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="nomiqa-contacts-${stamp}.csv"`,
      // ملف يحمل بيانات شخصية لا يُخزَّن في أي طبقة.
      'cache-control': 'no-store',
    },
  });
}
