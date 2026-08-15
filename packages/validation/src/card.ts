import { CARD_LINK_TYPES, CARD_SECTIONS, SOCIAL_PLATFORMS } from '@nomiqa/contracts';
import { z } from 'zod';
import { cardContactFormSchema } from './contact.js';
import { emailSchema, localeSchema, phoneSchema, slugSchema, uuidSchema } from './primitives.js';

/**
 * مخططات البطاقة.
 *
 * تُستخدم في المحرر وفي الـAPI بنفس التعريف. كل قاعدة هنا تُفرض في
 * الطرفين، والـAPI هو الفاصل: تحقق المتصفح للتجربة فقط (§4.6).
 */

/** نص اختياري: الفراغ يعني «امسح القيمة» لا «لا تغيّرها». */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `الحد الأقصى ${max} حرفاً`)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();
}

export const cardContentSchema = z.object({
  locale: localeSchema,
  fullName: z.string().trim().min(2, 'الاسم قصير جداً').max(120, 'الاسم طويل جداً'),
  jobTitle: optionalText(120),
  organizationName: optionalText(160),
  department: optionalText(120),
  bio: optionalText(600),
  addressLine: optionalText(240),
});

export type CardContentInput = z.infer<typeof cardContentSchema>;

/**
 * رابط ويب كما يكتبه المستخدم.
 *
 * الناس تكتب `nomiqa.om` لا `https://nomiqa.om`. نطبّع القيمة قبل
 * التحقق بدل رفضها، ثم نخزّنها **مطبَّعة** فلا يتكرر التطبيع في كل
 * موضع عرض.
 */
const webUrlValue = z
  .string()
  .trim()
  .min(4, 'الرابط قصير جداً')
  .max(2048, 'الرابط طويل جداً')
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .refine((value) => {
    try {
      const url = new URL(value);
      // javascript: و data: تمر من فحص «يحتوي نقطتين» الساذج.
      return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.');
    } catch {
      return false;
    }
  }, 'صيغة الرابط غير صحيحة');

/**
 * رابط أو وسيلة تواصل.
 *
 * التحقق من `value` يعتمد على `type`: رقم الهاتف يجب أن يكون E.164،
 * والبريد بريداً، والباقي روابط. لولا ذلك لقبلنا `tel:not-a-number`
 * وأنتجنا زراً لا يعمل على هاتف الزائر.
 */
export const cardLinkSchema = z
  .object({
    /** موجود عند تعديل رابط قائم، غائب عند إضافة جديد. */
    id: uuidSchema.optional(),
    type: z.enum(CARD_LINK_TYPES, { message: 'نوع رابط غير مدعوم' }),
    platform: z.enum(SOCIAL_PLATFORMS, { message: 'منصة غير مدعومة' }).nullable().optional(),
    label: optionalText(40),
    labelEn: optionalText(40),
    value: z.string().trim().min(1, 'القيمة مطلوبة').max(2048),
    position: z.number().int().min(0).max(99),
    isVisible: z.boolean().default(true),
    isPrimary: z.boolean().default(false),
  })
  .superRefine((link, ctx) => {
    const addIssue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message });

    // نتحقق من القيمة **بعد التطبيع** لا قبله: الناس تكتب أرقامها
    // بفراغات (‎+968 9123 4567). رفضها ثم تطبيعها لاحقاً يعني رفض
    // مدخل صحيح لأجل شكله، وهو ما لا يفهمه أحد.
    const value = normalizeLinkValue(link.type, link.value);

    switch (link.type) {
      case 'phone':
      case 'whatsapp': {
        if (!phoneSchema.safeParse(value).success) {
          addIssue('يجب أن يكون الرقم بصيغة دولية مثل ‎+96891234567');
        }
        break;
      }

      case 'email': {
        if (!emailSchema.safeParse(value).success) {
          addIssue('صيغة البريد الإلكتروني غير صحيحة');
        }
        break;
      }

      default: {
        if (!webUrlValue.safeParse(value).success) {
          addIssue('صيغة الرابط غير صحيحة');
        }
      }
    }

    // بلا منصة يصبح الرابط الاجتماعي زراً بلا اسم ولا أيقونة.
    if (link.type === 'social' && !link.platform) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['platform'],
        message: 'اختر المنصة الاجتماعية',
      });
    }
  })
  // التطبيع بعد التحقق: القيمة المخزّنة هي القيمة المعروضة.
  .transform((link) => ({
    ...link,
    value: normalizeLinkValue(link.type, link.value),
  }));

export type CardLinkInput = z.infer<typeof cardLinkSchema>;

/** يخزّن القيمة بالصيغة التي ستُعرض وتُستخدم في `href` دون معالجة إضافية. */
export function normalizeLinkValue(type: string, value: string): string {
  const trimmed = value.trim();

  switch (type) {
    case 'phone':
    case 'whatsapp':
      // بلا فراغات: الفراغ داخل tel: يكسر بعض متصفحات الهاتف.
      return trimmed.replace(/[\s-]/g, '');

    case 'email':
      return trimmed.toLowerCase();

    default:
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
}

export const cardThemeSchema = z
  .object({
    primaryColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'اللون يجب أن يكون بصيغة ‎#RRGGBB')
      .optional(),
    borderRadius: z.enum(['small', 'medium', 'large']).optional(),
    colorScheme: z.enum(['light', 'dark', 'system']).optional(),
  })
  .strict();

export type CardThemeInput = z.infer<typeof cardThemeSchema>;

/** ترتيب الأقسام. التكرار خطأ عميل لا تفضيل عرض. */
export const sectionOrderSchema = z
  .array(z.enum(CARD_SECTIONS, { message: 'قسم غير معروف' }))
  .max(CARD_SECTIONS.length)
  .refine((sections) => new Set(sections).size === sections.length, 'لا يجوز تكرار قسم');

export const createCardSchema = z
  .object({
    fullName: z.string().trim().min(2, 'الاسم قصير جداً').max(120),
    /** يُولَّد من الاسم أو البريد حين لا يختاره المستخدم. */
    slug: slugSchema.optional(),
    templateKey: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9-]+$/, 'مفتاح قالب غير صالح')
      .default('classic'),
    defaultLocale: localeSchema.default('ar'),
  })
  .strict();

export type CreateCardInput = z.infer<typeof createCardSchema>;

/**
 * حقول البطاقة القابلة للتعديل — بلا `revision`.
 *
 * يستخدمها المحرر في المتصفح: النموذج يتحقق من الحقول، أما الإصدار
 * فحالة تزامن لا حقل يملأه المستخدم.
 *
 * `content` و`links` **استبدال كامل** لا دمج: المحرر يرسل الحالة
 * النهائية، والدمج الجزئي يجعل حذف رابط عملية مستحيلة التعبير.
 */
export const cardUpdateFieldsSchema = z
  .object({
    slug: slugSchema.optional(),
    templateKey: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9-]+$/, 'مفتاح قالب غير صالح')
      .optional(),
    defaultLocale: localeSchema.optional(),
    theme: cardThemeSchema.nullable().optional(),
    sectionOrder: sectionOrderSchema.nullable().optional(),
    content: z
      .array(cardContentSchema)
      .min(1, 'البطاقة تحتاج محتوى بلغة واحدة على الأقل')
      .max(2)
      .refine(
        (entries) => new Set(entries.map((entry) => entry.locale)).size === entries.length,
        'لا يجوز تكرار اللغة',
      )
      .optional(),
    links: z.array(cardLinkSchema).max(30, 'الحد الأقصى 30 رابطاً').optional(),
    contactForm: cardContactFormSchema.optional(),
    avatarFileId: uuidSchema.nullable().optional(),
    coverFileId: uuidSchema.nullable().optional(),
    logoFileId: uuidSchema.nullable().optional(),
  })
  .strict();

export type CardUpdateFields = z.infer<typeof cardUpdateFieldsSchema>;
export type CardUpdateFieldsInput = z.input<typeof cardUpdateFieldsSchema>;

/**
 * تعديل البطاقة كما يستقبله الـAPI.
 *
 * `revision` إلزامي: الحفظ التلقائي في المحرر ونافذة أخرى مفتوحة على
 * البطاقة نفسها حالة واقعية، وبدون تدقيق الإصدار يفوز آخر من يحفظ
 * ويُمحى عمل الآخر صامتاً (§4.5 Optimistic Concurrency).
 */
export const updateCardSchema = cardUpdateFieldsSchema
  .extend({ revision: z.number().int().positive() })
  .strict()
  // `revision` وحده ليس تحديثاً — طلب فارغ خطأ في العميل.
  .refine((value) => Object.keys(value).length > 1, 'لم تُرسل أي حقول للتحديث');

export type UpdateCardInput = z.infer<typeof updateCardSchema>;

/**
 * يشتق slug صالحاً من نص حر.
 *
 * الأسماء العربية شائعة والـslug لاتيني فقط (§7.4)، فالناتج قد يكون
 * فارغاً — يعالج المستدعي ذلك باحتياط، ولا نخمّن نقحرة عربية تنتج
 * روابط لا يتعرف عليها صاحبها.
 */
export function slugifyName(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      // إزالة علامات التشكيل اللاتينية: é → e
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '')
  );
}
