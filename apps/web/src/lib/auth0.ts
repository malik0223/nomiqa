import { Auth0Client } from '@auth0/nextjs-auth0/server';

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
});
