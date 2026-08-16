import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@nomiqa/contracts';
import {
  adminReplySchema,
  suspendOrganizationSchema,
  upsertCouponSchema,
  upsertPlanPriceSchema,
  upsertPlanSchema,
} from '@nomiqa/validation';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from '../tenancy/current.decorators.js';
import { NoTenantRequired } from '../tenancy/no-tenant.decorator.js';
import { AdminBillingService } from './admin-billing.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

const revenueQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});

const supportQueueQuerySchema = z.object({
  status: z
    .enum(['open', 'pending_customer', 'pending_platform', 'resolved', 'closed'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * إدارة الأعمال في لوحة المنصة (§9.5).
 *
 * منفصلة عن `AdminController` لأنها مجال مختلف: تلك تُشغّل المنصة
 * (الرايات، الإجماليات، سجل التدقيق)، وهذه تُدير علاقتها التجارية
 * بالعملاء. الحارس والمبدأ واحد.
 */
@ApiTags('admin')
@ApiBearerAuth()
@NoTenantRequired()
@UseGuards(PlatformAdminGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminBillingController {
  constructor(private readonly billing: AdminBillingService) {}

  @Get('plans')
  @ApiOperation({ summary: 'الباقات وأسعارها وأعداد مشتركيها' })
  async plans() {
    return this.billing.listPlans();
  }

  @Put('plans')
  @ApiOperation({ summary: 'إنشاء باقة أو تعديلها' })
  async upsertPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(upsertPlanSchema)) body: z.infer<typeof upsertPlanSchema>,
    @Req() request: Request,
  ) {
    return this.billing.upsertPlan(user.id, body, request.requestId);
  }

  @Put('plans/:key/prices')
  @ApiOperation({ summary: 'ضبط سعر باقة لدورة فوترة' })
  async upsertPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(upsertPlanPriceSchema))
    body: z.infer<typeof upsertPlanPriceSchema>,
    @Req() request: Request,
  ) {
    return this.billing.upsertPrice(user.id, key, body, request.requestId);
  }

  @Get('coupons')
  @ApiOperation({ summary: 'أكواد الخصم' })
  async coupons() {
    return this.billing.listCoupons();
  }

  @Put('coupons')
  @ApiOperation({ summary: 'إنشاء كود خصم أو تعديله' })
  async upsertCoupon(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(upsertCouponSchema)) body: z.infer<typeof upsertCouponSchema>,
    @Req() request: Request,
  ) {
    return this.billing.upsertCoupon(user.id, body, request.requestId);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'تقرير الإيراد — مجاميع فقط' })
  async revenue(
    @Query(new ZodValidationPipe(revenueQuerySchema)) query: z.infer<typeof revenueQuerySchema>,
  ) {
    return this.billing.revenueReport(query.months);
  }

  @Post('organizations/:id/suspend')
  @HttpCode(204)
  @ApiOperation({ summary: 'تعليق مؤسسة' })
  async suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(suspendOrganizationSchema))
    body: z.infer<typeof suspendOrganizationSchema>,
    @Req() request: Request,
  ): Promise<void> {
    await this.billing.suspend(user.id, id, body, request.requestId);
  }

  @Post('organizations/:id/unsuspend')
  @HttpCode(204)
  @ApiOperation({ summary: 'رفع التعليق' })
  async unsuspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.billing.unsuspend(user.id, id, request.requestId);
  }

  @Get('support/tickets')
  @ApiOperation({ summary: 'طابور الدعم' })
  async supportQueue(
    @Query(new ZodValidationPipe(supportQueueQuerySchema))
    query: z.infer<typeof supportQueueQuerySchema>,
  ) {
    return this.billing.supportQueue(query.status ?? null, query.limit);
  }

  @Get('support/tickets/:id')
  @ApiOperation({ summary: 'رسائل تذكرة — تُسجَّل قراءتها' })
  async ticket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.billing.readTicket(user.id, id, request.requestId);
  }

  @Post('support/tickets/:id/reply')
  @ApiOperation({ summary: 'الرد على تذكرة' })
  async reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminReplySchema)) body: z.infer<typeof adminReplySchema>,
    @Req() request: Request,
  ) {
    return this.billing.replyToTicket(user.id, id, body.body, body.isInternal, request.requestId);
  }
}
