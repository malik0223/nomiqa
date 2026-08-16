import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { NoTenantRequired } from '../tenancy/no-tenant.decorator.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * كتالوج الأسعار العام.
 *
 * `@Public` مبرَّر: صفحة الأسعار تُقرأ قبل التسجيل — اشتراط حساب لرؤية
 * السعر يعكس ترتيب القرار. لا يكشف هذا المسار شيئاً عن أي مؤسسة:
 * الباقات كتالوج واحد للمنصة كلها، والباقات غير المعلنة مستبعدة.
 */
@ApiTags('billing')
@Controller({ path: 'plans', version: '1' })
export class PublicPlansController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @Public()
  @NoTenantRequired()
  @RateLimit({ limit: 60, windowSeconds: 60 })
  @ApiOperation({ summary: 'الباقات المعلنة وأسعارها' })
  async list() {
    return this.subscriptions.listPlans();
  }
}
