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

/** مفاتيح تُحجب أينما ظهرت داخل حمولة تقرير الخطأ. */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'access_token',
  'refresh_token',
  'clientsecret',
  'client_secret',
  'email',
  'phone',
  'to',
  'recipient',
  'ipaddress',
  'ip_address',
]);

/**
 * يحجب القيم الحساسة داخل بنية متداخلة قبل إرسالها إلى طرف خارجي.
 *
 * إخفاء البيانات الشخصية من السجلات (§9.4) ينطبق على تقارير الأخطاء
 * أيضاً — بل بأشد، لأنها تغادر بنيتنا إلى مزوّد خارجي.
 */
export function scrubSensitive<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubSensitive(item, depth + 1)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? '[REDACTED]'
      : scrubSensitive(item, depth + 1);
  }

  return result as T;
}
