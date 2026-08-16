import { CARD_EVENT_TYPES } from '@nomiqa/contracts';
import { z } from 'zod';
import { attributionSchema } from './presence.js';
import { localeSchema, uuidSchema } from './primitives.js';

/**
 * مخططات التحليلات.
 *
 * ما **لا** يقبله مخطط الإرسال أهم مما يقبله: لا معرّف مؤسسة، ولا
 * معرّف بطاقة، ولا وقت وقوع، ولا أي معرّف زائر. الثلاثة الأولى تُشتق
 * في الخادم، والرابع لا وجود له أصلاً. لو قبلنا `occurredAt` من العميل
 * لصار بوسع أي أحد كتابة تاريخ ماضٍ وتشويه تقرير شهر مضى.
 */
export const analyticsEventSchema = z
  .object({
    type: z.enum(CARD_EVENT_TYPES, { message: 'نوع حدث غير مدعوم' }),
    /** للنقرات وحدها. يُتجاهل لغير link_click. */
    linkId: uuidSchema.nullable().optional(),
    locale: localeSchema.optional(),
  })
  .strict();

/**
 * دفعة أحداث.
 *
 * الصفحة تجمّع أحداثها وترسلها دفعة واحدة عند مغادرة الزائر
 * (`sendBeacon`)، فالحد الأعلى هو أقصى تفاعل معقول في زيارة واحدة —
 * ورقم أكبر منه إشارة إساءة لا استخدام.
 */
export const analyticsBatchSchema = z
  .object({
    events: z.array(analyticsEventSchema).min(1, 'لا أحداث').max(20, 'دفعة كبيرة جداً'),
    /**
     * إسناد الزيارة (§10.4). اختياري: زيارة مباشرة لا تحمله.
     *
     * حقل واحد للدفعة لا حقل لكل حدث: مصدر الزيارة لا يتغير بين نقرة
     * وأخرى في الجلسة نفسها، وتكراره في عشرين حدثاً كان يضاعف حجم
     * الطلب في أكثر مسارات المنصة استدعاءً.
     */
    attribution: attributionSchema.optional(),
  })
  .strict();

export type AnalyticsBatchInput = z.infer<typeof analyticsBatchSchema>;

/** المدى الزمني المتاح. أطول من ذلك يحتاج تقارير لا لوحة. */
export const ANALYTICS_RANGES = ['7d', '30d', '90d'] as const;

export const analyticsQuerySchema = z
  .object({
    /** بلا قيمة: كل بطاقات المؤسسة مجتمعة. */
    cardId: uuidSchema.optional(),
    range: z.enum(ANALYTICS_RANGES).default('30d'),
  })
  .strict();

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;

/** عدد الأيام لكل مدى — مصدر واحد للحقيقة بين الـAPI والواجهة. */
export const ANALYTICS_RANGE_DAYS: Record<(typeof ANALYTICS_RANGES)[number], number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};
