import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { auth0 } from './lib/auth0';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

/**
 * ترتيب المعالجة مقصود:
 *  1. Auth0 يعالج مسارات /auth/* (login, logout, callback) ويجدّد الجلسة.
 *  2. next-intl يتولى بقية المسارات لتحديد اللغة والتوجيه.
 */
export async function middleware(request: NextRequest) {
  const authResponse = await auth0.middleware(request);

  if (request.nextUrl.pathname.startsWith('/auth')) {
    return authResponse;
  }

  const intlResponse = intlMiddleware(request);

  // ننقل كوكيز الجلسة المحدَّثة من استجابة Auth0 حتى لا يُفقد التجديد.
  for (const cookie of authResponse.cookies.getAll()) {
    intlResponse.cookies.set(cookie);
  }

  return intlResponse;
}

export const config = {
  matcher: [
    // كل المسارات عدا الملفات الثابتة وملفات Next الداخلية.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico)$).*)',
  ],
};
