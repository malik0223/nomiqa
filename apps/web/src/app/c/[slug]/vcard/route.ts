import { buildVCard, vCardFileName } from '@nomiqa/ui';
import { slugSchema } from '@nomiqa/validation';
import { fetchPublicCard, publicCardUrl } from '@/lib/cards';

/**
 * تنزيل جهة الاتصال.
 *
 * يُقدَّم من الخادم لا من المتصفح عمداً: توليد ملف في المتصفح يتطلب
 * JavaScript وBlob وتحايلاً على منع التنزيل في بعض متصفحات الهاتف،
 * بينما رابط عادي يحمل `Content-Type: text/vcard` يفتح تطبيق جهات
 * الاتصال مباشرة على iOS وAndroid (§7.4).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;

  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) {
    return new Response('Not found', { status: 404 });
  }

  const card = await fetchPublicCard(parsed.data);
  if (!card) {
    return new Response('Not found', { status: 404 });
  }

  const requested = new URL(request.url).searchParams.get('lang');
  const locale =
    requested && card.snapshot.content[requested] ? requested : card.snapshot.defaultLocale;

  const vcard = buildVCard(card.snapshot, { locale, publicUrl: publicCardUrl(parsed.data) });

  return new Response(vcard, {
    headers: {
      // charset=utf-8 إلزامي: الأسماء العربية تصل مشوّهة بدونه.
      'content-type': 'text/vcard; charset=utf-8',
      'content-disposition': `attachment; filename="${vCardFileName(parsed.data)}"`,
      // أقصر من QR: محتوى vCard يتغيّر مع كل نشر، بخلاف الرمز.
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
