import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS, withRlsContext } from '@nomiqa/database';
import {
  applyCouponSchema,
  billingProfileSchema,
  cancelSubscriptionSchema,
  invoiceListQuerySchema,
  startSubscriptionSchema,
  type BillingProfileInput,
  type StartSubscriptionInput,
} from '@nomiqa/validation';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { EntitlementsService } from './entitlements.service.js';
import { InvoicesService } from './invoices.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

@ApiTags('billing')
@ApiBearerAuth()
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly invoices: InvoicesService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('plans')
  @RequirePermissions(PERMISSIONS.BILLING_READ)
  @ApiOperation({ summary: 'الباقات المتاحة' })
  async plans() {
    return this.subscriptions.listPlans();
  }

  @Get('entitlements')
  @RequirePermissions(PERMISSIONS.BILLING_READ)
  @ApiOperation({ summary: 'الحدود والميزات والاستخدام' })
  async entitlementsSummary(@CurrentTenant() tenant: TenantContext) {
    return this.entitlements.describe(tenant.organizationId);
  }

  @Get('subscription')
  @RequirePermissions(PERMISSIONS.BILLING_READ)
  @ApiOperation({ summary: 'الاشتراك الحالي' })
  async subscription(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptions.get(tenant.organizationId);
  }

  /**
   * معاينة التغيير.
   *
   * `POST` رغم أنها لا تكتب شيئاً: المدخلات مركّبة (باقة ودورة وكود
   * خصم وعدد مقاعد)، وكود الخصم تحديداً لا يوضع في مسار يُسجَّل.
   */
  @Post('preview')
  @RequirePermissions(PERMISSIONS.BILLING_READ)
  @ApiOperation({ summary: 'معاينة تغيير الباقة' })
  async preview(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(startSubscriptionSchema)) body: StartSubscriptionInput,
  ) {
    return this.subscriptions.previewChange(tenant.organizationId, body);
  }

  @Post('coupon/validate')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @ApiOperation({ summary: 'التحقق من كود خصم' })
  async validateCoupon(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(applyCouponSchema)) body: { code: string },
    @Query('planKey') planKey: string,
    @Query('amountBaisa') amountBaisa: string,
  ) {
    return this.subscriptions.validateCoupon(
      tenant.organizationId,
      body.code,
      planKey || 'business',
      Number(amountBaisa) || 0,
    );
  }

  @Post('checkout')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  @RateLimit({ limit: 10, windowSeconds: 300 })
  @ApiOperation({ summary: 'بدء اشتراك أو تغيير باقة' })
  async checkout(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(startSubscriptionSchema)) body: StartSubscriptionInput,
  ) {
    return this.subscriptions.checkout(tenant.organizationId, user.id, body);
  }

  /**
   * تأكيد دفعة بعد عودة المتصفح.
   *
   * لا يصدّق شيئاً مما في الرابط: `ref` مجرد مفتاح بحث، والحالة تُقرأ
   * من البوابة. من يفتح رابط العودة يدوياً لا يُفعّل اشتراكاً.
   */
  @Post('confirm/:reference')
  @RequirePermissions(PERMISSIONS.BILLING_READ)
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @ApiOperation({ summary: 'تأكيد نتيجة الدفع' })
  async confirm(@CurrentTenant() tenant: TenantContext, @Param('reference') reference: string) {
    const result = await this.invoices.confirmPayment(reference);

    if (result.status === 'paid' && result.invoiceId) {
      await this.subscriptions.applyPaidInvoice(tenant.organizationId, result.invoiceId);
    }

    return result;
  }

  @Post('cancel')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  @ApiOperation({ summary: 'إلغاء الاشتراك' })
  async cancel(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(cancelSubscriptionSchema))
    body: { immediate: boolean; reason?: string | null },
  ) {
    return this.subscriptions.cancel(
      tenant.organizationId,
      user.id,
      body.immediate,
      body.reason ?? null,
    );
  }

  @Post('resume')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  @ApiOperation({ summary: 'التراجع عن الإلغاء' })
  async resume(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.resume(tenant.organizationId, user.id);
  }

  @Get('invoices')
  @RequirePermissions(PERMISSIONS.BILLING_READ)
  @ApiOperation({ summary: 'الفواتير' })
  async listInvoices(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(invoiceListQuerySchema))
    query: { status: 'all' | 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'; page: number; pageSize: number },
  ) {
    return this.invoices.list(tenant.organizationId, query.status, query.page, query.pageSize);
  }

  @Get('invoices/:id')
  @RequirePermissions(PERMISSIONS.BILLING_READ)
  @ApiOperation({ summary: 'تفاصيل فاتورة' })
  async getInvoice(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoices.get(tenant.organizationId, id);
  }

  @Post('invoices/:id/checkout')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  @RateLimit({ limit: 10, windowSeconds: 300 })
  @ApiOperation({ summary: 'فتح رابط دفع لفاتورة' })
  async payInvoice(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoices.createCheckout(tenant.organizationId, id);
  }

  /**
   * بيانات الفوترة.
   *
   * تُعدَّل بصلاحية الإدارة لا القراءة: الاسم والرقم الضريبي يُطبعان
   * على مستند ضريبي، وتغييرهما ليس تفضيلاً في الملف الشخصي.
   */
  @Put('profile')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  @ApiOperation({ summary: 'تحديث بيانات الفوترة' })
  async updateProfile(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(billingProfileSchema)) body: BillingProfileInput,
  ) {
    return withRlsContext(this.prisma, { organizationId: tenant.organizationId }, (tx) =>
      tx.organization.update({
        where: { id: tenant.organizationId },
        data: {
          billingName: body.billingName,
          billingEmail: body.billingEmail,
          billingVatNumber: body.billingVatNumber ?? null,
          billingAddress: body.billingAddress ?? null,
          billingCountry: body.billingCountry,
        },
        select: {
          billingName: true,
          billingEmail: true,
          billingVatNumber: true,
          billingAddress: true,
          billingCountry: true,
        },
      }),
    );
  }
}
