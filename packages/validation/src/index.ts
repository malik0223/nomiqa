import { z } from 'zod';

/**
 * مخططات التحقق المشتركة بين Web وAPI.
 *
 * قاعدة حاكمة: التحقق في المتصفح للتجربة فقط.
 * الـAPI يعيد التحقق من كل مدخل دائماً (§4.6 من وثيقة المعمارية).
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

/** حدود رفع الملفات — تُطبَّق في الواجهة وفي الـAPI معاً. */
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const imageUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(IMAGE_MIME_TYPES, { message: 'نوع الملف غير مدعوم' }),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES, 'حجم الملف يتجاوز 5 ميغابايت'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(64).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ---------- المؤسسات ----------

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جداً').max(120),
  nameEn: z.string().trim().min(2).max(120).optional(),
  slug: slugSchema,
  defaultLocale: localeSchema.default('ar'),
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  roleKey: z.enum(['admin', 'member']),
});

// ---------- الموافقات (§9.4) ----------

/**
 * الموافقة على التواصل منفصلة تماماً عن الموافقة التسويقية.
 * دمجهما في حقل واحد مخالفة لمتطلبات حماية البيانات.
 */
export const consentSchema = z.object({
  contactConsent: z.literal(true, {
    message: 'الموافقة على حفظ بيانات التواصل مطلوبة',
  }),
  marketingConsent: z.boolean().default(false),
  consentTextVersion: z.string().min(1),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type ConsentInput = z.infer<typeof consentSchema>;
