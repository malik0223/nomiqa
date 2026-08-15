import { z } from 'zod';

/**
 * اللبنات المشتركة لكل المخططات.
 *
 * تعيش في ملف مستقل لا في `index.ts` عمداً: مخططات المجالات (البطاقة،
 * الخصوصية…) تستوردها، و`index.ts` يعيد تصديرها. لو عاشت في `index.ts`
 * لصار الاستيراد دائرياً وانفجر التحميل عند أول استخدام.
 */

/** كلمات محجوزة لا يجوز استخدامها كـslug لأنها تتعارض مع مسارات النظام. */
export const RESERVED_SLUGS = [
  'api',
  'admin',
  'dashboard',
  'auth',
  'login',
  'logout',
  'signup',
  'settings',
  'org',
  'organization',
  'ar',
  'en',
  'static',
  '_next',
  'assets',
  'about',
  'pricing',
  'privacy',
  'terms',
  'support',
  // مسارات المرحلة 2: البطاقة العامة تُقدَّم من الجذر، فأي مقطع
  // يستخدمه التطبيق يجب ألا يكون slug بطاقة.
  'c',
  'cards',
  'card',
  'qr',
  'vcard',
  'contacts',
  'analytics',
] as const;

export const localeSchema = z.enum(['ar', 'en']);

export const uuidSchema = z.string().uuid('معرّف غير صالح');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'البريد الإلكتروني قصير جداً')
  .max(254, 'البريد الإلكتروني طويل جداً')
  .email('صيغة البريد الإلكتروني غير صحيحة');

/** رقم هاتف بصيغة E.164 — نخزّن دائماً بصيغة دولية موحّدة. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'يجب أن يكون الرقم بصيغة دولية مثل ‎+96891234567');

/**
 * slug البطاقة: أحرف لاتينية صغيرة وأرقام وشرطات فقط.
 * لا نسمح بالعربية في الرابط لتفادي مشكلات النسخ والمشاركة عبر QR.
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'الرابط قصير جداً')
  .max(48, 'الرابط طويل جداً')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'يسمح بالأحرف الإنجليزية الصغيرة والأرقام والشرطة فقط')
  .refine(
    (value) => !(RESERVED_SLUGS as readonly string[]).includes(value),
    'هذا الرابط محجوز، اختر رابطاً آخر',
  );

export const externalUrlSchema = z
  .string()
  .trim()
  .url('صيغة الرابط غير صحيحة')
  .refine(
    (value) => value.startsWith('https://') || value.startsWith('http://'),
    'يجب أن يبدأ الرابط بـhttp أو https',
  );

/** يفحص ما إذا كان مقطع المسار محجوزاً للنظام. يُستخدم في توجيه الويب. */
export function isReservedSlug(value: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(value.toLowerCase());
}
