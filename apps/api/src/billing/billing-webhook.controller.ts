import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../auth/public.decorator.js';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { NoTenantRequired } from '../tenancy/no-tenant.decorator.js';
import { InvoicesService } from './invoices.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * النداء الراجع من بوابة الدفع.
 *
 * **لا يُصدَّق منه شيء.** الجسم كله يُستخدم لاستخراج مرجع واحد، ثم
 * تُقرأ الحقيقة من البوابة باستعلام موقَّع بمفاتيحنا. هذا التصميم يجعل
 * غياب توقيع موثّق لدى المزوّد غير ذي أثر أمني: من يزوّر نداءً لا
 * يستطيع تزوير إجابة البوابة عن حالة الجلسة.
 *
 * يعيد 200 دائماً ما لم يقع خطأ داخلي: البوابات تعيد المحاولة على أي
 * رمز غير ناجح، ورفض نداء لمرجع لا نعرفه يجعلها تعيده إلى الأبد.
 */
const callbackSchema = z.object({
  client_reference_id: z.string().trim().min(1).max(200).optional(),
  data: z
    .object({ client_reference_id: z.string().trim().min(1).max(200).optional() })
    .optional(),
});

@ApiExcludeController()
@Controller({ path: 'billing/webhook', version: '1' })
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);

  constructor(
    private readonly invoices: InvoicesService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Post('thawani')
  @Public()
  @NoTenantRequired()
  @HttpCode(200)
  @RateLimit({ limit: 120, windowSeconds: 60 })
  async thawani(@Body() body: unknown): Promise<{ received: true }> {
    const parsed = callbackSchema.safeParse(body);
    const reference = parsed.success
      ? (parsed.data.client_reference_id ?? parsed.data.data?.client_reference_id)
      : undefined;

    if (!reference) {
      // لا نسجّل الجسم: قد يحمل بيانات دفع.
      this.logger.warn('نداء راجع بلا مرجع عميل');
      return { received: true };
    }

    try {
      const result = await this.invoices.confirmPayment(reference);

      if (result.status === 'paid' && result.invoiceId) {
        await this.subscriptions.applyPaidInvoice(result.organizationId, result.invoiceId);
      }
    } catch (error) {
      // الفشل هنا لا يُفقد شيئاً: دورة الـWorker تمر على الدفعات
      // المعلّقة وتؤكدها، فالنداء الراجع تسريع لا مصدر وحيد.
      this.logger.error(
        `تعذّرت معالجة النداء الراجع: ${error instanceof Error ? error.message : 'خطأ'}`,
      );
    }

    return { received: true };
  }
}
