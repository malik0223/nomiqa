import {
  API_KEY_SCOPES,
  CRM_OWNER_STRATEGIES,
  CRM_PROVIDERS,
  CRM_SYNCABLE_FIELDS,
  LEAD_QUALIFIER_TYPES,
  SCAN_KINDS,
  WEBHOOK_EVENT_TYPES,
} from '@nomiqa/contracts';
import { z } from 'zod';
import { emailSchema, externalUrlSchema, phoneSchema, uuidSchema } from './primitives.js';

/**
 * مخططات المبيعات والفعاليات والتكاملات (§11).
 *
 * ملاحظة حاكمة على الملف: كل ما يصل من مسح بطاقة يمر من هنا **بعد**
 * مراجعة الإنسان لا قبلها. مخرَج التعرّف الضوئي لا يُحفظ مباشرة، فلا
 * مخطط هنا يقبل «ناتج المحرك» — كلها تقبل ما أكّده المستخدم.
 */

// ------------------------------------------------------------
// الفعاليات (§11.3)
// ------------------------------------------------------------

/**
 * مفتاح حقل التأهيل.
 *
 * يولّده الخادم من التسمية لا المستخدم: المفتاح يصير عموداً في كل
 * تصدير ومفتاحاً في كل حمولة Webhook، ومسافةٌ أو حرف عربي فيه يكسر
 * جدول العميل بلا أن نعرف.
 */
const qualifierKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'المفتاح قصير جداً')
  .max(32, 'المفتاح طويل جداً')
  .regex(/^[a-z][a-z0-9_]*$/, 'يبدأ بحرف إنجليزي ويقبل الأرقام والشرطة السفلية');

export const leadQualifierSchema = z
  .object({
    key: qualifierKeySchema,
    label: z.string().trim().min(1, 'التسمية مطلوبة').max(60, 'التسمية طويلة جداً'),
    labelEn: z.string().trim().max(60).nullable().optional(),
    type: z.enum(LEAD_QUALIFIER_TYPES),
    options: z.array(z.string().trim().min(1).max(60)).max(12, 'الخيارات أكثر من اللازم').default([]),
    required: z.boolean().default(false),
  })
  .strict()
  .refine((value) => value.type !== 'select' || value.options.length > 0, {
    message: 'حقل الاختيار يحتاج خياراً واحداً على الأقل',
    path: ['options'],
  });

export type LeadQualifierInput = z.infer<typeof leadQualifierSchema>;

/**
 * حد عدد حقول التأهيل.
 *
 * ستة لا عشرون: النموذج يُملأ واقفاً في قاعة معرض بين محادثتين، وكل
 * حقل إضافي يخفض احتمال ملء الحقول كلها — فيصير التقرير أسوأ لا أفضل.
 */
export const MAX_LEAD_QUALIFIERS = 6;

/**
 * فعالية.
 *
 * النافذة الزمنية **مطلوبة** بطرفيها، خلافاً للحملة التي تقبل نهايةً
 * مفتوحة: الفعالية واقعة لها موعد معلن، ونافذتها هي ما يُصنِّف جهات
 * الاتصال إليها آلياً — فعالية بلا نهاية كانت ستبتلع كل التقاط لاحق
 * على بطاقاتها إلى الأبد.
 */
export const eventSchema = z
  .object({
    name: z.string().trim().min(2, 'اسم الفعالية قصير جداً').max(120, 'اسم الفعالية طويل جداً'),
    location: z.string().trim().max(160, 'الموقع طويل جداً').nullable().optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    /** البطاقات المخصصة للفعالية. الالتقاط عبرها داخل النافذة يُصنَّف إليها. */
    cardIds: z.array(uuidSchema).max(50, 'بطاقات أكثر من اللازم').default([]),
    qualifiers: z.array(leadQualifierSchema).max(MAX_LEAD_QUALIFIERS).default([]),
    /** كلفة المشاركة بالبيسة — عدد صحيح كبقية مبالغ المنصة. */
    costBaisa: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    targetLeads: z.number().int().min(0).max(1_000_000).nullable().optional(),
  })
  .strict()
  .refine((value) => new Date(value.startsAt) < new Date(value.endsAt), {
    message: 'تاريخ النهاية يجب أن يلي تاريخ البداية',
    path: ['endsAt'],
  })
  .refine(
    (value) => new Set(value.qualifiers.map((field) => field.key)).size === value.qualifiers.length,
    { message: 'مفاتيح حقول التأهيل مكرّرة', path: ['qualifiers'] },
  );

export type EventInput = z.infer<typeof eventSchema>;

/** قيم التأهيل كما يملؤها المندوب. تُقاس على تعريف الفعالية في الخدمة. */
export const qualifierValuesSchema = z.record(
  qualifierKeySchema,
  z.string().trim().max(200, 'القيمة طويلة جداً'),
);

export type QualifierValuesInput = z.infer<typeof qualifierValuesSchema>;

export const eventLeadUpdateSchema = z
  .object({
    eventId: uuidSchema.nullable(),
    qualifiers: qualifierValuesSchema.default({}),
  })
  .strict();

export type EventLeadUpdateInput = z.infer<typeof eventLeadUpdateSchema>;

// ------------------------------------------------------------
// المسح (§11.2)
// ------------------------------------------------------------

export const scanCreateSchema = z
  .object({
    /** ملف مرفوع ومؤكَّد بغرض `scan`. */
    fileId: uuidSchema,
    kind: z.enum(SCAN_KINDS).default('business_card'),
    eventId: uuidSchema.nullable().optional(),
  })
  .strict();

export type ScanCreateInput = z.infer<typeof scanCreateSchema>;

/**
 * مسح رمز QR من منصة أخرى (§11.2).
 *
 * لا يمر بالتخزين ولا بمحرك تعرّف: المتصفح يقرأ الرمز والنص يصل
 * مباشرة. حدّ الطول يحمي من حمولة ضخمة تُرسل بدل رمز.
 */
export const qrScanSchema = z
  .object({
    payload: z.string().trim().min(1, 'المحتوى فارغ').max(4096, 'المحتوى طويل جداً'),
    eventId: uuidSchema.nullable().optional(),
  })
  .strict();

export type QrScanInput = z.infer<typeof qrScanSchema>;

/**
 * ما يؤكّده الإنسان بعد المراجعة.
 *
 * الاسم وحده مطلوب: بطاقة معرض قد تحمل اسماً ومؤسسة بلا بريد، ورفض
 * حفظها لأنها ناقصة يعني فقدان لقاء وقع فعلاً. والحقول كلها **تُعاد
 * كتابتها من المستخدم**، فلا قيمة من المحرك تدخل قاعدة البيانات بلا
 * أن تمر على عين.
 */
export const scanConfirmSchema = z
  .object({
    fullName: z.string().trim().min(2, 'الاسم قصير جداً').max(120, 'الاسم طويل جداً'),
    email: emailSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    organizationName: z.string().trim().max(120).nullable().optional(),
    jobTitle: z.string().trim().max(120).nullable().optional(),
    eventId: uuidSchema.nullable().optional(),
    qualifiers: qualifierValuesSchema.default({}),
    /**
     * موافقة تسويقية صريحة منحها صاحب البطاقة شفاهةً.
     *
     * الافتراضي `false` ولا يجوز أن يصير `true` ضمناً: تسليم بطاقة
     * ورقية سند للتواصل المهني لا للإدراج في قائمة بريدية.
     */
    marketingConsent: z.boolean().default(false),
  })
  .strict();

export type ScanConfirmInput = z.infer<typeof scanConfirmSchema>;

// ------------------------------------------------------------
// مفاتيح الـAPI (§11.4 خطوة 1)
// ------------------------------------------------------------

export const apiKeyCreateSchema = z
  .object({
    name: z.string().trim().min(2, 'الاسم قصير جداً').max(80, 'الاسم طويل جداً'),
    scopes: z
      .array(z.enum(API_KEY_SCOPES))
      .min(1, 'اختر نطاقاً واحداً على الأقل')
      .max(API_KEY_SCOPES.length),
    /** ISO. الفارغ يعني بلا انتهاء — وهو خيار المؤسسة لا افتراضنا. */
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

// ------------------------------------------------------------
// Webhooks
// ------------------------------------------------------------

/**
 * وجهة Webhook.
 *
 * **HTTPS وحده**: الحمولة تحمل بيانات جهات اتصال، وإرسالها على HTTP
 * يضعها في كل وسيط على الطريق. والتحقق هنا لا يكفي وحده — الخدمة
 * تمنع أيضاً العناوين الداخلية، وذاك فحص وقت الإرسال لا وقت الحفظ.
 */
export const webhookEndpointSchema = z
  .object({
    url: externalUrlSchema.refine(
      (value) => value.startsWith('https://'),
      'يجب أن يبدأ الرابط بـhttps',
    ),
    description: z.string().trim().max(160).nullable().optional(),
    eventTypes: z
      .array(z.enum(WEBHOOK_EVENT_TYPES))
      .min(1, 'اختر حدثاً واحداً على الأقل')
      .max(WEBHOOK_EVENT_TYPES.length),
    isActive: z.boolean().default(true),
  })
  .strict();

export type WebhookEndpointInput = z.infer<typeof webhookEndpointSchema>;

// ------------------------------------------------------------
// مزامنة CRM (§11.5)
// ------------------------------------------------------------

const crmFieldMapSchema = z
  .record(z.enum(CRM_SYNCABLE_FIELDS), z.string().trim().min(1).max(80))
  .refine((value) => Object.keys(value).length > 0, 'اربط حقلاً واحداً على الأقل');

/**
 * وصلة CRM.
 *
 * الرمز اختياري عند التعديل: تعديل خريطة الحقول لا يجوز أن يستوجب
 * إعادة لصق رمز الوصول — ولا يجوز أن يُعيد إرساله إلى المتصفح، فلا
 * سبيل إلى ملء الحقل به أصلاً.
 */
export const crmConnectionSchema = z
  .object({
    provider: z.enum(CRM_PROVIDERS),
    accessToken: z.string().trim().min(8, 'الرمز قصير جداً').max(512).optional(),
    fieldMap: crmFieldMapSchema,
    ownerStrategy: z.enum(CRM_OWNER_STRATEGIES).default('capturer'),
    ownerRef: z.string().trim().max(80).nullable().optional(),
    marketingConsentOnly: z.boolean().default(false),
    status: z.enum(['active', 'paused']).default('active'),
  })
  .strict()
  .refine((value) => value.ownerStrategy !== 'fixed' || Boolean(value.ownerRef), {
    message: 'استراتيجية المالك الثابت تحتاج معرّف مالك',
    path: ['ownerRef'],
  });

export type CrmConnectionInput = z.infer<typeof crmConnectionSchema>;

/** إعادة إرسال ما فشل. مقيّدة بوصلة واحدة — لا «أعد كل شيء». */
export const crmRetrySchema = z
  .object({ logIds: z.array(uuidSchema).min(1).max(200) })
  .strict();

export type CrmRetryInput = z.infer<typeof crmRetrySchema>;

// ------------------------------------------------------------
// الـAPI العام للتكاملات
// ------------------------------------------------------------

/**
 * إنشاء جهة اتصال عبر مفتاح API.
 *
 * الموافقة **حقل مطلوب صريح** لا افتراضي: النظام المتصل يعرف كيف حصل
 * على هذه البيانات، ونحن لا نعرف. تمريره فارغاً كان يجعلنا نخترع سنداً
 * لصف بيانات شخص لم يتعامل معنا قط.
 */
export const externalContactSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: emailSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    organizationName: z.string().trim().max(120).nullable().optional(),
    jobTitle: z.string().trim().max(120).nullable().optional(),
    eventId: uuidSchema.nullable().optional(),
    consent: z
      .object({
        granted: z.literal(true, { message: 'لا يُقبل صف بلا سند موافقة' }),
        /** وصف السند لدى النظام المرسِل — يُخزَّن كما هو للإثبات. */
        basis: z.string().trim().min(3).max(120),
        marketing: z.boolean().default(false),
      })
      .strict(),
  })
  .strict();

export type ExternalContactInput = z.infer<typeof externalContactSchema>;

export const externalContactsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    /** ISO. يعيد ما التُقط بعده — أساس المزامنة التزايدية عند العميل. */
    since: z.string().datetime({ offset: true }).optional(),
    eventId: uuidSchema.optional(),
  })
  .strict();

export type ExternalContactsQueryInput = z.infer<typeof externalContactsQuerySchema>;
