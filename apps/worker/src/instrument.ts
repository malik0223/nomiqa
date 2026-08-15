import * as Sentry from '@sentry/node';
import { scrubSensitive } from '@nomiqa/observability';

/**
 * تهيئة Sentry للـWorker.
 *
 * أهم من الـAPI بمعنى: فشل مهمة خلفية لا يراه أحد. لا مستخدم ينتظر
 * استجابة ولا شاشة تعرض خطأً — يمر الفشل صامتاً ما لم يُرصد.
 */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION,
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    beforeSend(event) {
      if (event.user) {
        event.user = { id: event.user.id };
      }
      if (event.extra) {
        event.extra = scrubSensitive(event.extra);
      }
      return event;
    },
  });
}
