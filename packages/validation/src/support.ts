import { z } from 'zod';

/**
 * مخططات الدعم والبلاغات (خارطة الطريق §9.5).
 */

export const ticketCategorySchema = z.enum([
  'billing',
  'technical',
  'abuse',
  'feature_request',
  'other',
]);

export const ticketPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const ticketStatusSchema = z.enum([
  'open',
  'pending_customer',
  'pending_platform',
  'resolved',
  'closed',
]);

/**
 * نص الرسالة.
 *
 * حدّ 4000 حرف: أطول من ذلك يعني مرفقاً في الغالب، والمرفقات تمر
 * بمسار الملفات لا بعمود نصّي.
 */
const ticketBodySchema = z.string().trim().min(10, 'اشرح المشكلة بجملة كاملة').max(4000);

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'العنوان قصير جداً').max(160),
  category: ticketCategorySchema.default('other'),
  priority: ticketPrioritySchema.default('normal'),
  body: ticketBodySchema,
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const replyToTicketSchema = z.object({
  body: ticketBodySchema,
});

export const adminReplySchema = replyToTicketSchema.extend({
  /** ملاحظة داخلية لفريق المنصة — لا تُعرض للعميل ولا تُغيّر حالة التذكرة. */
  isInternal: z.boolean().default(false),
});

export const updateTicketStatusSchema = z.object({
  status: ticketStatusSchema,
});
