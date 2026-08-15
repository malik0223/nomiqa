import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import {
  analyticsBatchSchema,
  analyticsQuerySchema,
  slugSchema,
  type AnalyticsBatchInput,
  type AnalyticsQueryInput,
} from '@nomiqa/validation';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator.js';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { AnalyticsIngestService } from './analytics-ingest.service.js';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'ملخص أداء البطاقات' })
  async overview(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQueryInput,
  ) {
    return this.analytics.overview(tenant.organizationId, query);
  }
}

/**
 * استقبال أحداث الصفحة العامة.
 *
 * ثالث مسار عام في المنصة، وأكثرها تكراراً: يُستدعى من كل فتح بطاقة.
 * ولذلك قيوده مختلفة عن قيود النموذج:
 *
 *  - **202 لا 200**: الحدث يدخل طابوراً ولا يُكتب في هذا الطلب. الرد
 *    بـ200 يوحي بضمان لا نقدّمه.
 *  - حد معدل أوسع من النموذج وأضيق من قراءة البطاقة: زائر واحد قد
 *    يرسل عدة دفعات في زيارة طويلة، لكن لا شيء يبرر المئات.
 *  - الجسم لا يحمل معرّف بطاقة ولا مؤسسة ولا وقتاً — كلها تُشتق في
 *    الخادم. راجع `analyticsEventSchema`.
 */
@ApiTags('public')
@Controller({ path: 'public/cards', version: '1' })
export class PublicAnalyticsController {
  constructor(private readonly ingest: AnalyticsIngestService) {}

  @Post(':slug/events')
  @Public()
  @HttpCode(202)
  @RateLimit({ limit: 60, windowSeconds: 60 })
  @ApiOperation({ summary: 'تسجيل أحداث بطاقة عامة' })
  async collect(
    @Param('slug', new ZodValidationPipe(slugSchema)) slug: string,
    @Body(new ZodValidationPipe(analyticsBatchSchema)) body: AnalyticsBatchInput,
    @Req() request: Request,
  ): Promise<{ accepted: true }> {
    await this.ingest.ingest(slug, body, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
      referrer: request.get('referer'),
    });

    return { accepted: true };
  }
}
