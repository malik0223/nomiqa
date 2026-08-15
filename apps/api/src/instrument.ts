import * as Sentry from '@sentry/nestjs';
import { scrubSensitive } from '@nomiqa/observability';

/**
 * تهيئة Sentry.
 *
 * **يجب أن يُستورد قبل أي شيء آخر** في `main.ts`: التجهيز يعمل
 * بترقيع الوحدات، فما يُحمَّل قبله لا يُرصد.
 *
 * لا يُفعَّل بلا `SENTRY_DSN`، فتبقى بيئة التطوير صامتة ولا تُرسل
 * أخطاء محلية إلى مشروع مشترك.
 */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION,

    // حرج: لا يُرسل عناوين IP ولا ترويسات ولا أجساد الطلبات تلقائياً.
    // البيانات الشخصية لا تغادر بنيتنا إلى مزوّد خارجي (§9.4).
    sendDefaultPii: false,

    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    /**
     * طبقة حجب ثانية فوق sendDefaultPii.
     * الأولى تمنع الجمع التلقائي، وهذه تنظّف ما نضيفه نحن عمداً أو سهواً.
     */
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        event.request.headers = scrubSensitive(event.request.headers ?? {});
      }

      if (event.user) {
        // المعرّف الداخلي يكفي للربط؛ البريد والعنوان لا يغادران.
        event.user = { id: event.user.id };
      }

      if (event.extra) {
        event.extra = scrubSensitive(event.extra);
      }

      return event;
    },
  });
}
