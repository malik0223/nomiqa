import { z } from 'zod';
import { emailSchema, localeSchema, slugSchema } from './primitives.js';

/**
 * مخططات التحقق المشتركة بين Web وAPI.
 *
 * قاعدة حاكمة: التحقق في المتصفح للتجربة فقط.
 * الـAPI يعيد التحقق من كل مدخل دائماً (§4.6 من وثيقة المعمارية).
 */

export * from './primitives.js';
export * from './card.js';

/** حدود رفع الملفات — تُطبَّق في الواجهة وفي الـAPI معاً. */
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export const DOCUMENT_MIME_TYPES = ['application/pdf'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** غرض الملف. يحدد النوع المسموح والحجم الأقصى. */
export const FILE_PURPOSES = ['avatar', 'logo', 'cover', 'document'] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

export const filePurposeRules: Record<
  FilePurpose,
  { mimeTypes: readonly string[]; maxBytes: number }
> = {
  avatar: { mimeTypes: IMAGE_MIME_TYPES, maxBytes: MAX_IMAGE_BYTES },
  logo: { mimeTypes: IMAGE_MIME_TYPES, maxBytes: MAX_IMAGE_BYTES },
  cover: { mimeTypes: IMAGE_MIME_TYPES, maxBytes: MAX_IMAGE_BYTES },
  document: { mimeTypes: DOCUMENT_MIME_TYPES, maxBytes: MAX_DOCUMENT_BYTES },
};

/**
 * طلب رابط رفع.
 *
 * التحقق مزدوج عمداً: الصيغة أولاً، ثم مطابقة النوع والحجم لقواعد
 * الغرض المحدد — فلا يُقبل PDF كصورة شخصية ولا صورة بحجم مستند.
 */
export const uploadRequestSchema = z
  .object({
    purpose: z.enum(FILE_PURPOSES, { message: 'غرض غير مدعوم' }),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(128),
    sizeBytes: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    const rules = filePurposeRules[value.purpose];

    if (!rules.mimeTypes.includes(value.mimeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mimeType'],
        message: `نوع غير مدعوم لهذا الغرض. المسموح: ${rules.mimeTypes.join('، ')}`,
      });
    }

    if (value.sizeBytes > rules.maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sizeBytes'],
        message: `الحجم يتجاوز الحد المسموح (${Math.round(rules.maxBytes / 1024 / 1024)} ميغابايت)`,
      });
    }
  });

export type UploadRequestInput = z.infer<typeof uploadRequestSchema>;

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
/**
 * تحديث الملف الشخصي.
 *
 * البريد **غير مشمول** عمداً: تغييره يتطلب إعادة تحقق، وقبوله بلا
 * تحقق ناقلُ استيلاء على الحساب. راجع docs/privacy/rectification.md
 */
export const profileUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2, 'الاسم قصير جداً').max(120).nullable().optional(),
    locale: localeSchema.optional(),
    // قائمة IANA — نتحقق من الصيغة لا من كل قيمة ممكنة.
    timeZone: z
      .string()
      .trim()
      .max(64)
      .regex(/^[A-Za-z]+\/[A-Za-z_+-]+$/, 'صيغة المنطقة الزمنية غير صحيحة')
      .optional(),
  })
  .strict()
  // طلب فارغ خطأ في العميل لا تحديث بلا أثر.
  .refine((value) => Object.keys(value).length > 0, 'لم تُرسل أي حقول للتحديث');

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// ---------- رايات الميزات ----------

export const featureFlagUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    rolloutPercentage: z.number().int().min(0).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'لم تُرسل أي حقول للتحديث');

export const featureFlagOverrideSchema = z
  .object({
    organizationId: z.string().uuid('معرّف مؤسسة غير صالح'),
    enabled: z.boolean(),
  })
  .strict();

export type FeatureFlagUpdateInput = z.infer<typeof featureFlagUpdateSchema>;
export type FeatureFlagOverrideInput = z.infer<typeof featureFlagOverrideSchema>;

/** تحديث موافقة واحدة. الأغراض الإلزامية لا تُسحب من هنا. */
export const consentUpdateSchema = z.object({
  purpose: z.enum(['terms', 'privacy', 'marketing'], { message: 'غرض غير معروف' }),
  granted: z.boolean(),
});

export type ConsentUpdateInput = z.infer<typeof consentUpdateSchema>;

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
