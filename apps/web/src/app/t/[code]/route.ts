import { shareCodeSchema } from '@nomiqa/validation';
import { NextResponse } from 'next/server';
import { appBaseUrl, publicCardUrl } from '../../../lib/cards';
import { resolveShareCode } from '../../../lib/presence';

/**
 * هدف المشاركة: `nomiqa.om/t/<code>`.
 *
 * ما يُكتب داخل وسم NFC وما يُشفَّر في رمز حملة مطبوع. مسار قصير عمداً:
 * الوسم قد يُقرأ بالعين ويُكتب يدوياً، والرمز قد يُطبع بحجم صغير على
 * لافتة — وكل حرف زائد يزيد كثافة الرمز.
 *
 * إعادة توجيه 302 لا 301: الوسم قابل لإعادة التوجيه إلى بطاقة أخرى في
 * أي لحظة (موظف غادر وسُلّم وسمه لخلفه)، و301 تجعل المتصفح يتذكر
 * الوجهة القديمة إلى الأبد — أي وسماً لا يمكن إصلاحه على جهاز فتحه.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await context.params;

  const parsed = shareCodeSchema.safeParse(code);
  if (!parsed.success) {
    return NextResponse.redirect(new URL('/', appBaseUrl()), 302);
  }

  const target = await resolveShareCode(parsed.data);

  // كود مجهول يذهب إلى الصفحة الرئيسية لا إلى 404: من يمسك وسماً لا
  // يفهم صفحة خطأ، وصفحة المنصة تعطيه سياقاً وطريقاً.
  if (!target) {
    return NextResponse.redirect(new URL('/', appBaseUrl()), 302);
  }

  const destination = new URL(publicCardUrl(target.slug));
  destination.searchParams.set('src', target.source);

  if (target.utm) {
    // الكود يُمرَّر ليُسنَد الحدث إلى الحملة في الخادم، وUTM تُمرَّر
    // ليقرأها ما يقيس العميل من أدوات خارجية. الاثنان لأن كلاً منهما
    // يخدم قارئاً مختلفاً.
    destination.searchParams.set('k', parsed.data);
    destination.searchParams.set('utm_source', target.utm.source);
    destination.searchParams.set('utm_medium', target.utm.medium);
    destination.searchParams.set('utm_campaign', target.utm.campaign);

    if (target.utm.term) destination.searchParams.set('utm_term', target.utm.term);
    if (target.utm.content) destination.searchParams.set('utm_content', target.utm.content);
  }

  return NextResponse.redirect(destination, 302);
}
