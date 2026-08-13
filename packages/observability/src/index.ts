import pino from 'pino';

/**
 * سجلات JSON منظّمة مع إخفاء البيانات الحساسة.
 *
 * قاعدة حاكمة (§9.4): لا تظهر بيانات شخصية ولا أسرار في السجلات.
 * أي حقل جديد يحمل بيانات شخصية يجب إضافته إلى REDACT_PATHS.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'clientSecret',
  'email',
  'phone',
  '*.email',
  '*.phone',
  '*.password',
];

export function createLogger(serviceName: string) {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = ReturnType<typeof createLogger>;

/** اسم الترويسة المعتمد لتتبّع الطلب عبر Web وAPI وWorker. */
export const REQUEST_ID_HEADER = 'x-request-id';

export function generateRequestId(): string {
  return crypto.randomUUID();
}
