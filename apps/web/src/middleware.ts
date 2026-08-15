import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { isReservedSlug } from '@nomiqa/validation';
import { auth0 } from './lib/auth0';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

/** شكل الـslug كما يقبله المخطط المشترك — لا تعريف ثانٍ هنا. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * ترتيب المعالجة مقصود:
 *  1. Auth0 يعالج مسارات /auth/* (login, logout, callback) ويجدّد الجلسة.
 *  2. البطاقة العامة على الجذر: `/<slug>` تُعاد كتابته إلى `/c/<slug>`.
 *  3. next-intl يتولى بقية المسارات لتحديد اللغة والتوجيه.
 */
export async function middleware(request: NextRequest) {
  const authResponse = await auth0.middleware(request);

  if (request.nextUrl.pathname.startsWith('/auth')) {
    return authResponse;
  }

  // مسارات البطاقة العامة الحقيقية (`/c/<slug>` و`/c/<slug>/qr` و
  // `/c/<slug>/vcard`) تمر كما هي. بدون هذا الاستثناء يضيف next-intl
  // بادئة لغة إلى `/c/...` فيتحوّل رابط vCard وQR إلى إعادة توجيه
  // تنتهي بـ404 — والفشل يظهر في تنزيل جهة الاتصال لا في الصفحة.
  if (isPublicCardPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const publicCard = publicCardRewrite(request);
  if (publicCard) {
    // بلا توجيه لغوي: رابط البطاقة يجب أن يبقى كما شاركه صاحبه، فلو
    // حوّلناه إلى /ar/<slug> لتغيّر الرابط المطبوع على QR عملياً.
    return NextResponse.rewrite(publicCard);
  }

  const intlResponse = intlMiddleware(request);

  // ننقل كوكيز الجلسة المحدَّثة من استجابة Auth0 حتى لا يُفقد التجديد.
  for (const cookie of authResponse.cookies.getAll()) {
    intlResponse.cookies.set(cookie);
  }

  return intlResponse;
}

/** المسار الداخلي للبطاقة العامة، وهو وجهة إعادة الكتابة نفسها. */
function isPublicCardPath(pathname: string): boolean {
  return pathname === '/c' || pathname.startsWith('/c/');
}

/**
 * يحوّل `/<slug>` إلى مسار البطاقة العامة.
 *
 * لماذا إعادة كتابة لا مسار ديناميكي في الجذر: `app/[locale]` تشغل
 * المقطع الأول من المسار، ولا يقبل Next مقطعين ديناميكيين مختلفين في
 * الموضع نفسه. الإعادة تحفظ الرابط القصير `nomiqa.om/<slug>` وتُبقي
 * التطبيق على بنيته.
 *
 * الحراسة: مقطع واحد فقط، بصيغة slug صحيحة، وغير محجوز — والقائمة
 * المحجوزة هي نفسها التي يرفضها مخطط التحقق عند إنشاء البطاقة، فلا
 * يمكن أصلاً أن يوجد slug يصطدم بمسار في التطبيق.
 */
function publicCardRewrite(request: NextRequest): URL | null {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);

  if (segments.length !== 1) {
    return null;
  }

  const candidate = segments[0]!.toLowerCase();

  if (!SLUG_PATTERN.test(candidate) || isReservedSlug(candidate)) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/c/${candidate}`;
  return url;
}

export const config = {
  matcher: [
    // كل المسارات عدا الملفات الثابتة وملفات Next الداخلية.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico)$).*)',
  ],
};
