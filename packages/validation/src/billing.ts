import { z } from 'zod';
import { PLAN_FEATURES } from '@nomiqa/contracts';
import { emailSchema } from './primitives.js';

/**
 * مخططات الاشتراكات والفوترة (خارطة الطريق §9.4).
 */

export const billingIntervalSchema = z.enum(['month', 'year']);

/**
 * كود الخصم كما يكتبه العميل.
 *
 * يُرفع إلى الأحرف الكبيرة ويُقصّ: الكود يُطبع في إعلان ويُنسخ بالبريد،
 * فوصوله بمسافة أو بحروف صغيرة هو الحالة الشائعة لا الاستثناء.
 */
export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, 'الكود قصير جداً')
  .max(40, 'الكود طويل جداً')
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'يسمح بالأحرف الإنجليزية والأرقام والشرطة فقط');

/** بيانات الفوترة المطبوعة على الفاتورة. */
export const billingProfileSchema = z.object({
  billingName: z.string().trim().min(1, 'اسم جهة الفوترة مطلوب').max(160),
  billingEmail: emailSchema,
  /**
   * الرقم الضريبي العُماني: OM + 10 أرقام.
   *
   * اختياري لأن الأفراد لا يملكونه، لكن صيغته تُفرض حين يُكتب — رقم
   * خطأ على فاتورة صادرة لا يُصحَّح إلا بإبطالها وإصدار بديلة.
   */
  billingVatNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^OM\d{10}$/, 'الرقم الضريبي بصيغة OM ثم عشرة أرقام')
    .nullable()
    .optional(),
  billingAddress: z.string().trim().max(300).nullable().optional(),
  billingCountry: z.string().trim().length(2).toUpperCase().default('OM'),
});

export type BillingProfileInput = z.infer<typeof billingProfileSchema>;

/**
 * بدء اشتراك أو تغيير باقة.
 *
 * `planKey` لا `priceId`: العميل يختار باقة ودورة، والسعر الساري يُحلّ
 * في الخادم. تمرير معرّف سعر من المتصفح كان يسمح بإرسال سعر قديم
 * أُلغي — والسعر مال.
 */
export const startSubscriptionSchema = z.object({
  planKey: z.string().trim().min(1).max(40),
  interval: billingIntervalSchema.default('month'),
  couponCode: couponCodeSchema.optional().nullable(),
  /** عدد المقاعد المطلوبة. يُتحقق من كفايتها للأعضاء الحاليين. */
  quantity: z.coerce.number().int().min(1).max(10_000).default(1),
});

export type StartSubscriptionInput = z.infer<typeof startSubscriptionSchema>;

export const changePlanSchema = startSubscriptionSchema;

export const cancelSubscriptionSchema = z.object({
  /**
   * الإلغاء الفوري ليس افتراضياً.
   *
   * العميل دفع فترةً كاملة؛ قطعها لحظة الضغط يجعل زر «إلغاء» يمحو
   * خدمةً مدفوعة. الافتراضي: تنتهي بنهاية الفترة.
   */
  immediate: z.boolean().default(false),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const applyCouponSchema = z.object({ code: couponCodeSchema });

export const invoiceListQuerySchema = z.object({
  status: z.enum(['draft', 'open', 'paid', 'void', 'uncollectible', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- لوحة إدارة المنصة ----------

const planLimitsSchema = z.object({
  /** ‎-1 = بلا حد. */
  maxCards: z.number().int().min(-1),
  maxMembers: z.number().int().min(-1),
  maxDepartments: z.number().int().min(-1),
  maxBranches: z.number().int().min(-1),
  maxContacts: z.number().int().min(-1),
});

export const upsertPlanSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, 'مفتاح الباقة أحرف إنجليزية صغيرة وأرقام وشرطة سفلية'),
  name: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  descriptionEn: z.string().trim().max(500).nullable().optional(),
  limits: planLimitsSchema,
  features: z.array(z.enum(PLAN_FEATURES)).default([]),
  trialDays: z.number().int().min(0).max(365).default(0),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

/**
 * سعر باقة.
 *
 * الحد الأدنى 100 بيسة: سعر أقل من ذلك لا يغطي رسوم البوابة، ووجوده
 * غالباً خطأ في وحدة الإدخال (كتابة الريال مكان البيسة).
 */
export const upsertPlanPriceSchema = z.object({
  interval: billingIntervalSchema,
  currency: z.string().trim().length(3).toUpperCase().default('OMR'),
  amountBaisa: z.number().int().min(100, 'المبلغ بالبيسة — 1 ريال = 1000 بيسة').max(100_000_000),
  isActive: z.boolean().default(true),
});

export const upsertCouponSchema = z
  .object({
    code: couponCodeSchema,
    name: z.string().trim().min(1).max(120),
    discountType: z.enum(['percent', 'fixed']),
    /** نقاط أساسية إن كان percent (10% = 1000)، أو بيسة إن كان fixed. */
    discountValue: z.number().int().min(1),
    durationCycles: z.number().int().min(1).max(120).nullable().optional(),
    maxRedemptions: z.number().int().min(1).nullable().optional(),
    appliesToPlanKeys: z.array(z.string().trim().min(1).max(40)).default([]),
    validUntil: z.coerce.date().nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine(
    (value) => value.discountType !== 'percent' || value.discountValue <= 10_000,
    { message: 'نسبة الخصم لا تتجاوز 100%', path: ['discountValue'] },
  );

/**
 * تعليق مؤسسة.
 *
 * السبب إلزامي: التعليق يقطع خدمة مدفوعة، وسجل التدقيق بلا سبب لا
 * يجيب على السؤال الوحيد الذي يُطرح لاحقاً.
 */
export const suspendOrganizationSchema = z.object({
  reason: z.string().trim().min(5, 'اذكر سبب التعليق').max(500),
  /** حجب الصفحات العامة أيضاً — إزالة محتوى منشور، لا مجرد منع لوحة. */
  blockPublicAccess: z.boolean().default(false),
});
