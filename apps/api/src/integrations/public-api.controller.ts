import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@nomiqa/contracts';
import {
  externalContactSchema,
  externalContactsQuerySchema,
  type ExternalContactInput,
  type ExternalContactsQueryInput,
} from '@nomiqa/validation';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/current.decorators.js';
import { API_KEY_HEADER } from './api-key.guard.js';
import { RequireApiScope } from './api-key.decorator.js';
import { PublicApiService } from './public-api.service.js';

/**
 * الـAPI العام للتكاملات (§11.4 خطوة 1).
 *
 * ثلاثة مسارات لا ثلاثون: قراءة جهات الاتصال، وكتابة واحدة، وقراءة
 * الفعاليات. هذا ما يلزم فعلاً لبناء تكامل — ونشر كل مسار داخلي على
 * مفتاح دائم يوسّع سطحاً لا نستطيع تضييقه لاحقاً بلا كسر عملاء.
 *
 * ومسار منفصل عن مسارات التطبيق `/integration/*` بدل إعادة استخدام
 * `/contacts`: العقد المنشور للعملاء يجب أن يتغيّر بوتيرته هو، لا
 * بوتيرة شاشة داخلية تُعاد كتابتها في كل مرحلة.
 */
@ApiTags('public-api')
@ApiSecurity(API_KEY_HEADER)
@Controller({ path: 'integration', version: '1' })
export class PublicApiController {
  constructor(private readonly api: PublicApiService) {}

  /**
   * حدّ معدل أوسع من حدّ المستخدمين وأضيق من اللانهاية.
   *
   * المزامنة التزايدية بـ`since` تحتاج نداءً كل بضع دقائق لا مئة في
   * الثانية، ومن يحتاج أكثر يحتاج تصديراً لا استعلاماً.
   */
  @Get('contacts')
  @RequireApiScope('contacts:read')
  @RateLimit({ limit: 120, windowSeconds: 60 })
  @ApiOperation({ summary: 'جهات الاتصال، مع مزامنة تزايدية بـsince' })
  async contacts(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(externalContactsQuerySchema)) query: ExternalContactsQueryInput,
  ) {
    return this.api.contacts(tenant.organizationId, query);
  }

  @Post('contacts')
  @RequireApiScope('contacts:write')
  @RateLimit({ limit: 120, windowSeconds: 60 })
  @ApiOperation({ summary: 'إنشاء جهة اتصال بسند موافقة معلَن' })
  async createContact(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(externalContactSchema)) body: ExternalContactInput,
  ) {
    return this.api.createContact(tenant.organizationId, body);
  }

  @Get('events')
  @RequireApiScope('events:read')
  @RateLimit({ limit: 120, windowSeconds: 60 })
  @ApiOperation({ summary: 'الفعاليات وأرقامها الإجمالية' })
  async events(@CurrentTenant() tenant: TenantContext) {
    return this.api.events(tenant.organizationId);
  }
}
