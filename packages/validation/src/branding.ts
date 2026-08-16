import { z } from 'zod';
import { LOCKABLE_FIELDS } from '@nomiqa/contracts';
import { uuidSchema } from './primitives.js';

/**
 * مخططات الهوية المؤسسية وسير الموافقة (خارطة الطريق §9.3).
 */

/** لون بصيغة hex. نفس القاعدة المطبَّقة على سمة البطاقة. */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'اللون يجب أن يكون بصيغة ‎#RRGGBB');

export const brandKitSchema = z.object({
  primaryColor: hexColorSchema.nullable().optional(),
  secondaryColor: hexColorSchema.nullable().optional(),
  backgroundColor: hexColorSchema.nullable().optional(),
  textColor: hexColorSchema.nullable().optional(),
  fontFamily: z.string().trim().max(80).nullable().optional(),
  logoFileId: uuidSchema.nullable().optional(),
  coverFileId: uuidSchema.nullable().optional(),
  hidePlatformBadge: z.boolean().optional(),
});

export type BrandKitInput = z.infer<typeof brandKitSchema>;

export const lockableFieldSchema = z.enum(LOCKABLE_FIELDS);

/**
 * سياسة بطاقات.
 *
 * الرفض حين تُذكر إدارة وفرع معاً مقصود: السياسة تُحلّ بالأخص، وصف
 * يطابق المحورين يجعل ترتيب الأولوية غامضاً — أي سياسة تفوز حين ينتمي
 * الموظف إلى إدارة لها سياسة وفرع له سياسة أخرى؟ منع الحالة عند
 * الإدخال أوضح من اختراع قاعدة ترجيح لا يفهمها المسؤول.
 */
export const brandPolicySchema = z
  .object({
    name: z.string().trim().min(1, 'اسم السياسة مطلوب').max(120),
    departmentId: uuidSchema.nullable().optional(),
    branchId: uuidSchema.nullable().optional(),
    templateKey: z.string().trim().min(1).max(60).nullable().optional(),
    lockedFields: z.array(lockableFieldSchema).max(LOCKABLE_FIELDS.length).default([]),
    requireApproval: z.boolean().default(false),
    enforcedValues: z.record(z.unknown()).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((value) => !(value.departmentId && value.branchId), {
    message: 'السياسة تخص إدارة أو فرعاً، لا الاثنين معاً',
    path: ['branchId'],
  });

export type BrandPolicyInput = z.infer<typeof brandPolicySchema>;

export const reviewChangeRequestSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  /**
   * الملاحظة مطلوبة عند الرفض.
   *
   * رفض بلا سبب يجعل الموظف يعيد إرسال الطلب نفسه، فتدور الحلقة.
   */
  note: z.string().trim().max(500).optional().nullable(),
});

export type ReviewChangeRequestInput = z.infer<typeof reviewChangeRequestSchema>;

/**
 * اسم مضيف النطاق المخصص.
 *
 * نرفض النطاقات الفرعية لنطاقنا: تسجيل `x.nomiqa.om` كنطاق «مخصص»
 * لمؤسسة يجعلها تلتقط مساراً نملكه نحن.
 */
export const customDomainSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .min(4, 'النطاق قصير جداً')
    .max(253, 'النطاق طويل جداً')
    .regex(
      /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/,
      'صيغة النطاق غير صحيحة',
    )
    .refine((value) => !value.endsWith('.nomiqa.om'), 'لا يمكن استخدام نطاق فرعي من nomiqa.om')
    .refine((value) => !value.startsWith('www.'), 'أدخل النطاق بلا www'),
});

export type CustomDomainInput = z.infer<typeof customDomainSchema>;
