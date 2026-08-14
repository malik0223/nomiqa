import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextResponse } from 'next/server';

/**
 * عميل Auth0 للتطبيق (ADR-010).
 *
 * يُطلب `audience` صراحةً حتى يصدر Auth0 **Access Token** صالحاً
 * لـNestJS API، لا ID Token فقط. بدونه ترفض حراسة الـAPI كل طلب.
 */
export const auth0 = new Auth0Client({
  authorizationParameters: {
    scope: 'openid profile email offline_access',
    audience: process.env.AUTH0_AUDIENCE,
  },

  /**
   * السلوك الافتراضي للـSDK يعرض رسالة عامة ("An error occurred during
   * the authorization flow") ويبتلع السبب الحقيقي، الذي يصل من Auth0
   * داخل `error.cause` كـ`error` و`error_description`.
   *
   * هنا نسجّل السبب كاملاً على الخادم — حيث لا يراه المستخدم — ونعيد
   * توجيهه بـcode فقط.
   *
   * تحذير أمني من توثيق الـSDK نفسه: رسالة الخطأ قد تحتوي مدخلات
   * منعكسة من المستخدم عبر `error_description`، فلا تُعرض في الصفحة
   * دون تهريب. لذلك نمرّر الرمز المصنّف فقط لا النص.
   */
  async onCallback(error, ctx) {
    const appBaseUrl = ctx.appBaseUrl ?? process.env.APP_BASE_URL ?? 'http://localhost:3000';

    if (error) {
      const cause = error.cause as { code?: string; message?: string } | undefined;

      console.error('[auth0:callback] فشل تسجيل الدخول', {
        name: error.name,
        code: error.code,
        message: error.message,
        // هذا هو السبب الفعلي القادم من Auth0
        auth0Error: cause?.code,
        auth0Description: cause?.message,
      });

      const url = new URL('/', appBaseUrl);
      // رمز مصنّف من الـSDK، وليس نصاً حراً من مصدر خارجي.
      url.searchParams.set('auth_error', sanitizeCode(cause?.code ?? error.code ?? 'unknown'));
      return NextResponse.redirect(url.toString());
    }

    return NextResponse.redirect(new URL(ctx.returnTo ?? '/', appBaseUrl).toString());
  },
});

/** يقصر الرمز على محارف آمنة حتى لا يُعاد أي شيء منعكس في الرابط. */
function sanitizeCode(code: string): string {
  return code.replace(/[^a-z0-9_-]/gi, '').slice(0, 64) || 'unknown';
}
