import {
  EMAIL_CLIENTS,
  MEETING_PLATFORMS,
  SHARE_CODE_LENGTH,
  SHARE_SOURCES,
  SIGNATURE_TEMPLATES,
  WALLET_PLATFORMS,
} from '@nomiqa/contracts';
import { z } from 'zod';
import { uuidSchema } from './primitives.js';

/**
 * مخططات الحضور المهني المتكامل (§10).
 *
 * ملاحظة حاكمة على كل ما يلي: الكود القصير **لا يُقبل من المستخدم
 * إنشاءً**. يولّده الخادم دائماً — كود يختاره صاحبه يفتح باب انتحال
 * أسماء العلامات التجارية (`/t/omantel`) وباب التخمين المنظّم، وكلاهما
 * لا علاج له بعد طباعة الوسوم.
 */

/** أبجدية Crockford Base32 دون الحروف الملتبسة. راجع `share-code.ts` في الـAPI. */
const SHARE_CODE_PATTERN = new RegExp(`^[0-9abcdefghjkmnpqrstvwxyz]{${SHARE_CODE_LENGTH}}$`);

/**
 * يطبّع كوداً قرأه إنسان.
 *
 * الحروف المحذوفة من أبجدية التوليد تُصحَّح لا تُرفض: من قرأ `l` من
 * وسم مطبوع قصد `1`، ورفضه يعني وسماً «معطّلاً» في يد عميل بينما الخلل
 * في خطّ الطباعة أو في عينه.
 *
 * التصحيح آمن لأن الحروف الأربعة **لا تظهر في أي كود مولَّد**، فلا
 * يمكن أن يتحول كود صالح إلى كود صالح آخر — أي لا يمكن أن يفتح وسمٌ
 * بطاقة غير بطاقته. الاختبار في `share-code.test.ts` يحرس هذا الشرط.
 */
export function normalizeShareCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[il]/g, '1')
    .replace(/o/g, '0')
    .replace(/u/g, 'v');
}

/**
 * كود قصير كما يصل من مسار عام.
 *
 * التطبيع جزء من المخطط لا خطوة قبله: كل من يقرأ كوداً — الـAPI،
 * ومسار `/t/<code>` في الويب — يمر من هنا، ونسخة ثانية من قاعدة
 * التصحيح كانت تعني مساراً يقبل ما يرفضه الآخر.
 */
export const shareCodeSchema = z
  .string()
  .trim()
  .transform(normalizeShareCode)
  .refine((value) => SHARE_CODE_PATTERN.test(value), 'كود غير صالح');

// ------------------------------------------------------------
// وسوم NFC
// ------------------------------------------------------------

const tagLabelSchema = z
  .string()
  .trim()
  .min(1, 'الاسم مطلوب')
  .max(80, 'الاسم طويل جداً')
  .nullable()
  .optional();

/**
 * إصدار وسم.
 *
 * البطاقة اختيارية: المؤسسة تشتري وسوماً قبل توزيعها على الموظفين،
 * وإجبارها على ربط كل وسم بموظف عند الإصدار كان يعني إعادة الإصدار
 * لكل تسليم — والوسم مطبوع فلا يُعاد إصداره.
 */
export const nfcTagCreateSchema = z
  .object({
    label: tagLabelSchema,
    cardId: uuidSchema.nullable().optional(),
  })
  .strict();

export type NfcTagCreateInput = z.infer<typeof nfcTagCreateSchema>;

/** إعادة توجيه وسم إلى بطاقة أخرى — أو فكّه بـnull. */
export const nfcTagAssignSchema = z
  .object({
    cardId: uuidSchema.nullable(),
    label: tagLabelSchema,
  })
  .strict();

export type NfcTagAssignInput = z.infer<typeof nfcTagAssignSchema>;

/**
 * إبطال وسم مفقود.
 *
 * السبب مطلوب لا اختياري: الإبطال لا رجعة فيه، وسجل التدقيق بلا سبب
 * لا يجيب عن السؤال الوحيد الذي يُسأل بعد شهور — «لماذا توقف وسم
 * الموظف عن العمل؟».
 */
export const nfcTagRevokeSchema = z
  .object({
    reason: z.string().trim().min(3, 'السبب مطلوب').max(200, 'السبب طويل جداً'),
    /** يُصدر وسماً بديلاً على البطاقة نفسها في العملية ذاتها. */
    issueReplacement: z.boolean().default(false),
  })
  .strict();

export type NfcTagRevokeInput = z.infer<typeof nfcTagRevokeSchema>;

// ------------------------------------------------------------
// الحملات
// ------------------------------------------------------------

/**
 * قيمة UTM.
 *
 * تُطبَّع إلى حروف صغيرة بلا مسافات: أدوات التحليل الخارجية تعامل
 * `Spring` و`spring` كمصدرين مختلفين، فتنقسم الحملة الواحدة إلى صفين
 * في تقرير العميل لا في تقريرنا — ولا يلومنا إلا نحن.
 */
const utmValueSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(60, 'القيمة طويلة جداً')
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, 'يسمح بالأحرف الإنجليزية والأرقام والنقطة والشرطة');

export const campaignSchema = z
  .object({
    name: z.string().trim().min(2, 'اسم الحملة قصير جداً').max(120, 'اسم الحملة طويل جداً'),
    cardId: uuidSchema,
    utmSource: utmValueSchema,
    utmMedium: utmValueSchema,
    utmCampaign: utmValueSchema,
    utmTerm: utmValueSchema.nullable().optional(),
    utmContent: utmValueSchema.nullable().optional(),
    /** ISO. الفارغ يعني «من الآن». */
    startsAt: z.string().datetime({ offset: true }).nullable().optional(),
    /** ISO. الفارغ يعني «بلا نهاية». */
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine(
    (value) =>
      !value.startsAt || !value.endsAt || new Date(value.startsAt) < new Date(value.endsAt),
    { message: 'تاريخ النهاية يجب أن يلي تاريخ البداية', path: ['endsAt'] },
  );

export type CampaignInput = z.infer<typeof campaignSchema>;

/** مدى تقرير الحملة. أطول من ذلك يحتاج تصديراً لا شاشة. */
export const CAMPAIGN_REPORT_RANGES = ['30d', '90d', '365d'] as const;

export const campaignReportQuerySchema = z
  .object({
    range: z.enum(CAMPAIGN_REPORT_RANGES).default('90d'),
  })
  .strict();

export type CampaignReportQueryInput = z.infer<typeof campaignReportQuerySchema>;

export const CAMPAIGN_REPORT_RANGE_DAYS: Record<(typeof CAMPAIGN_REPORT_RANGES)[number], number> = {
  '30d': 30,
  '90d': 90,
  '365d': 365,
};

// ------------------------------------------------------------
// التوقيع
// ------------------------------------------------------------

/** لون HEX من ستة أرقام. الصيغة المختصرة مرفوضة: عملاء البريد لا يتفقون عليها. */
const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'اللون يجب أن يكون بصيغة ‎#RRGGBB');

export const signatureOptionsSchema = z
  .object({
    showQr: z.boolean().default(true),
    showAvatar: z.boolean().default(true),
    showLogo: z.boolean().default(false),
    showSocialLinks: z.boolean().default(true),
    accentColor: hexColorSchema.nullable().optional(),
    disclaimer: z.string().trim().max(400, 'النص طويل جداً').nullable().optional(),
  })
  .strict();

export const signatureProfileSchema = z
  .object({
    cardId: uuidSchema,
    templateKey: z.enum(SIGNATURE_TEMPLATES),
    options: signatureOptionsSchema,
  })
  .strict();

export type SignatureProfileInput = z.infer<typeof signatureProfileSchema>;

/** قالب مؤسسي مركزي — يديره صاحب صلاحية الهوية لا الموظف. */
export const signatureTemplateSchema = z
  .object({
    name: z.string().trim().min(2, 'الاسم قصير جداً').max(80, 'الاسم طويل جداً'),
    templateKey: z.enum(SIGNATURE_TEMPLATES),
    options: signatureOptionsSchema,
    isDefault: z.boolean().default(false),
    isEnforced: z.boolean().default(false),
  })
  .strict();

export type SignatureTemplateInput = z.infer<typeof signatureTemplateSchema>;

export const signatureRenderQuerySchema = z
  .object({
    cardId: uuidSchema,
    locale: z.enum(['ar', 'en']).default('ar'),
    client: z.enum(EMAIL_CLIENTS).optional(),
  })
  .strict();

export type SignatureRenderQueryInput = z.infer<typeof signatureRenderQuerySchema>;

// ------------------------------------------------------------
// خلفيات الاجتماعات
// ------------------------------------------------------------

export const meetingBackgroundQuerySchema = z
  .object({
    cardId: uuidSchema,
    platform: z.enum(MEETING_PLATFORMS).default('zoom'),
    locale: z.enum(['ar', 'en']).default('ar'),
    /** لوحة داكنة أو فاتحة. المعاينة الذاتية تختلف كثيراً بين الاثنتين. */
    scheme: z.enum(['light', 'dark']).default('dark'),
    showQr: z.coerce.boolean().default(true),
  })
  .strict();

export type MeetingBackgroundQueryInput = z.infer<typeof meetingBackgroundQuerySchema>;

// ------------------------------------------------------------
// المحافظ
// ------------------------------------------------------------

export const walletIssueSchema = z
  .object({
    cardId: uuidSchema,
    platform: z.enum(WALLET_PLATFORMS),
  })
  .strict();

export type WalletIssueInput = z.infer<typeof walletIssueSchema>;

// ------------------------------------------------------------
// إسناد المصدر
// ------------------------------------------------------------

/**
 * ما تُلحقه الصفحة العامة بأحداث القياس.
 *
 * منفصل عن `analyticsEventSchema` عمداً: المصدر خاصية **الزيارة** لا
 * الحدث، ويصل مرة واحدة مع الدفعة لا مع كل نقرة.
 */
export const attributionSchema = z
  .object({
    source: z.enum(SHARE_SOURCES).optional(),
    campaignCode: shareCodeSchema.optional(),
  })
  .strict();

export type AttributionInput = z.infer<typeof attributionSchema>;
