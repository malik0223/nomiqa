import {
  CONTACT_FOLLOW_UP_STATUSES,
  CONTACT_FORM_FIELDS,
  CONTACT_SOURCES,
  FOLLOW_UP_TASK_STATUSES,
} from '@nomiqa/contracts';
import { z } from 'zod';
import { emailSchema, localeSchema, phoneSchema, uuidSchema } from './primitives.js';

/**
 * مخططات جهات الاتصال.
 *
 * النموذج العام هو **المسار الوحيد في المنصة الذي يكتب صفاً بمدخل من
 * مجهول**. لذلك كل حد هنا مقصود ومحسوب: لا حقول مفتوحة الطول، ولا
 * قائمة حقول مفتوحة، ولا قبول لمفتاح لم تعرّفه البطاقة.
 */

/** نص اختياري: الفراغ يعني «لا قيمة» لا سلسلة فارغة في قاعدة البيانات. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `الحد الأقصى ${max} حرفاً`)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();
}

// ---------------------------------------------------------------
// إعداد النموذج على البطاقة
// ---------------------------------------------------------------

/**
 * مفتاح حقل مخصص.
 *
 * يُكتب مفتاحاً في JSON، ويُعرض في ملف CSV عموداً. تقييده بأحرف
 * لاتينية وشرطة سفلية يمنع مفاتيح تكسر التصدير أو تصطدم بأسماء
 * الحقول المعروفة.
 */
const customFieldKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z][a-z0-9_]*$/, 'مفتاح الحقل يبدأ بحرف إنجليزي صغير ويسمح بالأرقام والشرطة السفلية')
  .refine(
    (value) => !(CONTACT_FORM_FIELDS as readonly string[]).includes(value),
    'هذا المفتاح محجوز لحقل معروف',
  );

export const cardContactFormSchema = z
  .object({
    enabled: z.boolean(),
    fields: z
      .array(
        z
          .object({
            key: z.enum(CONTACT_FORM_FIELDS, { message: 'حقل غير معروف' }),
            required: z.boolean().default(false),
          })
          .strict(),
      )
      .max(CONTACT_FORM_FIELDS.length)
      .refine(
        (fields) => new Set(fields.map((field) => field.key)).size === fields.length,
        'لا يجوز تكرار الحقل',
      ),
    customFields: z
      .array(
        z
          .object({
            key: customFieldKeySchema,
            label: z.string().trim().min(1, 'عنوان الحقل مطلوب').max(60),
            labelEn: optionalText(60),
            required: z.boolean().default(false),
          })
          .strict(),
      )
      // ثلاثة حقول مخصصة كافية لنموذج على شاشة هاتف. الحد ليس تقنياً:
      // نموذج طويل يقلّل الإرسال، وهو المقياس الذي تُقاس به هذه الميزة.
      .max(3, 'الحد الأقصى 3 حقول مخصصة')
      .refine(
        (fields) => new Set(fields.map((field) => field.key)).size === fields.length,
        'لا يجوز تكرار مفتاح حقل مخصص',
      )
      .default([]),
  })
  .strict()
  .superRefine((form, ctx) => {
    if (!form.enabled) return;

    // بلا بريد ولا هاتف تصبح جهة الاتصال اسماً لا سبيل للرد عليه —
    // أي نموذج يجمع بيانات شخصية بلا فائدة تبرر جمعها.
    const keys = new Set(form.fields.map((field) => field.key));
    if (!keys.has('email') && !keys.has('phone')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fields'],
        message: 'أضف البريد الإلكتروني أو الهاتف على الأقل',
      });
    }
  });

export type CardContactFormInput = z.infer<typeof cardContactFormSchema>;

// ---------------------------------------------------------------
// النموذج العام
// ---------------------------------------------------------------

/**
 * إرسال زائر.
 *
 * `contactConsent: true` حرفياً لا `boolean`: القيمة `false` ليست
 * «موافقة مرفوضة» تُحفظ، بل طلب غير صالح — لا نكتب الصف أصلاً.
 *
 * `website` مصيدة: حقل مخفي عن البشر تملؤه الروبوتات. وجوده يعني
 * إرسالاً آلياً، فنردّ بنجاح ظاهري دون كتابة — الرد بخطأ يعلّم
 * الروبوت كيف يتجنب المصيدة في المحاولة التالية.
 */
export const contactSubmissionSchema = z
  .object({
    fullName: z.string().trim().min(2, 'الاسم قصير جداً').max(120, 'الاسم طويل جداً'),
    email: emailSchema.optional(),
    phone: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s-]/g, ''))
      .pipe(phoneSchema)
      .optional(),
    organizationName: optionalText(160),
    jobTitle: optionalText(120),
    message: optionalText(1000),
    /** قيم الحقول المخصصة. تُطابق مفاتيحها بإعداد البطاقة في الـAPI. */
    customFields: z.record(customFieldKeySchema, z.string().trim().max(500)).default({}),
    locale: localeSchema.default('ar'),
    contactConsent: z.literal(true, { message: 'الموافقة على حفظ بياناتك مطلوبة' }),
    marketingConsent: z.boolean().default(false),
    consentTextVersion: z.string().trim().min(1).max(32),
    website: z.string().max(200).optional(),
  })
  .strict()
  .refine(
    (value) => value.email !== undefined || value.phone !== undefined,
    // بلا وسيلة تواصل لا يستطيع صاحب البطاقة الرد، فيصير الإرسال
    // جمع بيانات بلا غرض.
    { path: ['email'], message: 'أدخل البريد الإلكتروني أو رقم الهاتف' },
  );

export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>;

// ---------------------------------------------------------------
// الإدارة
// ---------------------------------------------------------------

export const contactCreateSchema = z
  .object({
    fullName: z.string().trim().min(2, 'الاسم قصير جداً').max(120),
    email: emailSchema.optional(),
    phone: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s-]/g, ''))
      .pipe(phoneSchema)
      .optional(),
    organizationName: optionalText(160),
    jobTitle: optionalText(120),
    message: optionalText(1000),
    cardId: uuidSchema.nullable().optional(),
    tagIds: z.array(uuidSchema).max(20).default([]),
  })
  .strict()
  .refine((value) => value.email !== undefined || value.phone !== undefined, {
    path: ['email'],
    message: 'أدخل البريد الإلكتروني أو رقم الهاتف',
  });

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;

export const contactUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2, 'الاسم قصير جداً').max(120).optional(),
    email: emailSchema.nullable().optional(),
    phone: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s-]/g, ''))
      .pipe(phoneSchema)
      .nullable()
      .optional(),
    organizationName: optionalText(160),
    jobTitle: optionalText(120),
    followUpStatus: z
      .enum(CONTACT_FOLLOW_UP_STATUSES, { message: 'حالة متابعة غير معروفة' })
      .optional(),
    /** موعد تذكير. `null` يلغيه. */
    followUpAt: z.string().datetime({ message: 'صيغة تاريخ غير صحيحة' }).nullable().optional(),
    /** استبدال كامل لتصنيفات جهة الاتصال. */
    tagIds: z.array(uuidSchema).max(20).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'لم تُرسل أي حقول للتحديث');

export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;

export const contactNoteSchema = z
  .object({
    body: z.string().trim().min(1, 'الملاحظة فارغة').max(2000, 'الملاحظة طويلة جداً'),
  })
  .strict();

export type ContactNoteInput = z.infer<typeof contactNoteSchema>;

export const tagSchema = z
  .object({
    name: z.string().trim().min(1, 'اسم التصنيف مطلوب').max(40, 'اسم التصنيف طويل جداً'),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'اللون يجب أن يكون بصيغة ‎#RRGGBB')
      .nullable()
      .optional(),
  })
  .strict();

export type TagInput = z.infer<typeof tagSchema>;

export const followUpTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'عنوان التذكير مطلوب').max(160),
    dueAt: z.string().datetime({ message: 'صيغة تاريخ غير صحيحة' }),
    assignedUserId: uuidSchema.nullable().optional(),
  })
  .strict();

export type FollowUpTaskInput = z.infer<typeof followUpTaskSchema>;

export const followUpTaskUpdateSchema = z
  .object({
    status: z.enum(FOLLOW_UP_TASK_STATUSES, { message: 'حالة غير معروفة' }),
  })
  .strict();

/**
 * تصفية القائمة.
 *
 * `search` يُطابق الاسم والبريد والهاتف والمؤسسة. لا نبني بحثاً نصياً
 * كاملاً في هذه المرحلة: القوائم المتوقعة بالمئات لا بالملايين، وILIKE
 * على فهرس المؤسسة يكفي — والترقية إلى tsvector تتم عند ظهور بطء فعلي.
 */
export const contactQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  cardId: uuidSchema.optional(),
  tagId: uuidSchema.optional(),
  status: z.enum(CONTACT_FOLLOW_UP_STATUSES).optional(),
  source: z.enum(CONTACT_SOURCES).optional(),
  /** إظهار المكررة فقط، أو إخفاؤها. الافتراضي: الكل. */
  duplicates: z.enum(['only', 'exclude']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ContactQueryInput = z.infer<typeof contactQuerySchema>;

// ---------------------------------------------------------------
// التطبيع
// ---------------------------------------------------------------

/**
 * مفتاح مطابقة البريد.
 *
 * تصغير الأحرف فقط. **لا نحذف النقاط ولا ما بعد `+`** رغم أن Gmail
 * يتجاهلهما: تلك قاعدة مزوّد واحد لا قاعدة بريد، وتطبيقها على كل
 * النطاقات يدمج شخصين مختلفين في صف واحد على خوادم تعاملها كعنوانين.
 */
export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** مفتاح مطابقة الهاتف: أرقام فقط بعد إزالة الفواصل وصيغة E.164. */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, '');
  return digits.length >= 7 ? digits : null;
}
