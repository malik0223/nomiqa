import { z } from 'zod';
import { emailSchema, localeSchema, uuidSchema } from './primitives.js';

/**
 * مخططات إدارة الفريق والهيكل التنظيمي (خارطة الطريق §9.2).
 */

/**
 * رمز الوحدة التنظيمية.
 *
 * محصور بالحروف والأرقام والشرطات: هذا الرمز مفتاح مطابقة في ملف
 * الاستيراد، ومسافة زائدة أو حرف خفي في ملف Excel كان سيُنتج إدارة
 * ثانية تحمل الاسم نفسه بلا أن يفهم أحد لماذا.
 */
export const unitCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'الرمز مطلوب')
  .max(32, 'الرمز طويل جداً')
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'يسمح بالأحرف الإنجليزية والأرقام والشرطة والشرطة السفلية فقط');

const unitNameSchema = z.string().trim().min(1, 'الاسم مطلوب').max(120, 'الاسم طويل جداً');

export const createDepartmentSchema = z.object({
  name: unitNameSchema,
  nameEn: unitNameSchema.optional().nullable(),
  code: unitCodeSchema.optional().nullable(),
  parentId: uuidSchema.optional().nullable(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export const createBranchSchema = z.object({
  name: unitNameSchema,
  nameEn: unitNameSchema.optional().nullable(),
  code: unitCodeSchema.optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  country: z.string().trim().length(2, 'رمز الدولة حرفان').toUpperCase().optional().nullable(),
  addressLine: z.string().trim().max(240).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
});

export const updateBranchSchema = createBranchSchema.partial();

/**
 * الأدوار القابلة للإسناد على المؤسسة كلها.
 *
 * `owner` غير مذكور: المالك يُنقل بمسار خاص يشترط موافقة المالك الحالي،
 * لا بقائمة منسدلة في شاشة الأعضاء.
 */
export const assignableRoleSchema = z.enum(['admin', 'member']);

/** الأدوار التي لا تُسنَد إلا بنطاق إدارة أو فرع. */
export const scopedRoleSchema = z.enum(['department_admin', 'branch_admin']);

export const scopeTypeSchema = z.enum(['department', 'branch']);

const jobTitleSchema = z.string().trim().max(120, 'المسمى الوظيفي طويل جداً');
const employeeNoSchema = z.string().trim().max(40, 'الرقم الوظيفي طويل جداً');

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: assignableRoleSchema.default('member'),
  departmentId: uuidSchema.optional().nullable(),
  branchId: uuidSchema.optional().nullable(),
  jobTitle: jobTitleSchema.optional().nullable(),
  employeeNo: employeeNoSchema.optional().nullable(),
  locale: localeSchema.default('ar'),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/**
 * رمز الدعوة كما يصل من الرابط.
 *
 * طول ثابت وأحرف hex: الرمز يُولَّد عندنا، فأي شكل آخر محاولة تخمين
 * تُرفض قبل أن تلمس قاعدة البيانات.
 */
export const invitationTokenSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/, 'رمز الدعوة غير صالح');

export const updateMemberSchema = z.object({
  role: assignableRoleSchema.optional(),
  departmentId: uuidSchema.nullable().optional(),
  branchId: uuidSchema.nullable().optional(),
  jobTitle: jobTitleSchema.nullable().optional(),
  jobTitleEn: jobTitleSchema.nullable().optional(),
  employeeNo: employeeNoSchema.nullable().optional(),
  directoryVisible: z.boolean().optional(),
});

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const grantScopeSchema = z.object({
  role: scopedRoleSchema,
  scopeType: scopeTypeSchema,
  scopeId: uuidSchema,
});

/**
 * إنهاء خدمة موظف.
 *
 * `transferToUserId` ليس اختيارياً بلا سبب: بيانات المؤسسة التجارية
 * (البطاقات وجهات الاتصال) لا يجوز أن تُيتَّم بمغادرة موظف. تركه فارغاً
 * قرار صريح بأن تبقى في عهدة المؤسسة بلا مالك محدد.
 */
export const offboardMemberSchema = z.object({
  /** إلغاء الوصول فوراً أم في تاريخ لاحق معلن. */
  effectiveAt: z.coerce.date().optional(),
  /** إلغاء نشر بطاقات الموظف — الافتراضي نعم (§9.2). */
  unpublishCards: z.boolean().default(true),
  transferToUserId: uuidSchema.optional().nullable(),
  reason: z.string().trim().max(240).optional().nullable(),
});

export type OffboardMemberInput = z.infer<typeof offboardMemberSchema>;

export const directoryQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  departmentId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const memberListQuerySchema = directoryQuerySchema.extend({
  status: z.enum(['active', 'revoked', 'all']).default('active'),
});

/**
 * خيارات دفعة الاستيراد.
 *
 * `sendInvites: false` مسار مقصود: مسؤول يستورد ألف موظف يريد مراجعة
 * النتيجة قبل أن يصل ألف بريد لا يمكن سحبه.
 */
export const employeeImportOptionsSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  createCards: z.boolean().default(false),
  sendInvites: z.boolean().default(true),
  defaultRole: assignableRoleSchema.default('member'),
});

export type EmployeeImportOptionsInput = z.infer<typeof employeeImportOptionsSchema>;

/** صف واحد من ملف الاستيراد بعد التحليل. */
export const employeeImportRowSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().max(160).optional().nullable(),
  jobTitle: jobTitleSchema.optional().nullable(),
  employeeNo: employeeNoSchema.optional().nullable(),
  departmentCode: unitCodeSchema.optional().nullable(),
  branchCode: unitCodeSchema.optional().nullable(),
  role: assignableRoleSchema.optional().nullable(),
});
