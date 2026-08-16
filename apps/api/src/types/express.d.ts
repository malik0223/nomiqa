import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenant?: TenantContext;
      requestId?: string;
      /**
       * معرّف مفتاح الـAPI الذي صادق الطلب (§11.4).
       *
       * منفصل عن `user` عمداً ولا يُملأ معه أبداً: الطالب هنا نظام لا
       * شخص، ودمجهما كان يجعل كل مسار يقرأ `user` يظن أن إنساناً
       * اتخذ الفعل — وهو ما يظهر في سجل التدقيق باسم لا يخص أحداً.
       */
      apiKeyId?: string;
    }
  }
}

export {};
