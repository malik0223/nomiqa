import { z } from 'zod';

/**
 * مخطط متغيرات البيئة المشتركة.
 * يفشل التطبيق عند الإقلاع إذا كان أي متغير مطلوب ناقصاً أو غير صالح،
 * بدلاً من الفشل لاحقاً داخل طلب مستخدم.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
});

export const redisEnvSchema = z.object({
  REDIS_URL: z.string().url(),
});

/**
 * إعدادات Auth0 المطلوبة في الـAPI.
 * الـAPI يتحقق من الـAccess Token فقط، ولا يحتاج Client Secret.
 */
export const auth0ApiEnvSchema = z.object({
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_AUDIENCE: z.string().min(1),
});

export const storageEnvSchema = z.object({
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type Auth0ApiEnv = z.infer<typeof auth0ApiEnvSchema>;

/**
 * يتحقق من البيئة ويرمي رسالة واضحة تسرد كل متغير ناقص دفعة واحدة.
 */
export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`فشل التحقق من متغيرات البيئة:\n${issues}`);
  }

  return result.data;
}

/** أسماء اللغات المدعومة — مصدر واحد للحقيقة عبر التطبيقات. */
export const SUPPORTED_LOCALES = ['ar', 'en'] as const;
export const DEFAULT_LOCALE = 'ar';
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function directionForLocale(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
