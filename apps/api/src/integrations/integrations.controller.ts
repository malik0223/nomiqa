import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import {
  apiKeyCreateSchema,
  crmConnectionSchema,
  crmRetrySchema,
  webhookEndpointSchema,
  type ApiKeyCreateInput,
  type CrmConnectionInput,
  type CrmRetryInput,
  type WebhookEndpointInput,
} from '@nomiqa/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { ApiKeysService } from './api-keys.service.js';
import { CrmService } from './crm.service.js';
import { WebhooksService } from './webhooks.service.js';

/**
 * إدارة التكاملات (§11.4 و§11.5).
 *
 * كل المسارات بـ`integrations:manage` — وهي في البذرة للمالك وحده.
 * ما يُدار من هنا ليس شاشةً بل **قنوات خروج دائمة لبيانات العملاء**:
 * مفتاح يقرأ جهات الاتصال بلا جلسة، ووجهة تتلقى كل التقاط لحظة وقوعه،
 * ووصلة تكتب في نظام طرف ثالث. الثلاثة تبقى تعمل بعد أن يغادر من
 * أنشأها، ولا يوقفها تسجيل خروج.
 */
@ApiTags('integrations')
@ApiBearerAuth()
@Controller({ path: 'integrations', version: '1' })
export class IntegrationsController {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly webhooks: WebhooksService,
    private readonly crm: CrmService,
  ) {}

  // ---------------------------------------------------------------
  // مفاتيح الـAPI
  // ---------------------------------------------------------------

  @Get('api-keys')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @ApiOperation({ summary: 'مفاتيح الـAPI' })
  async listKeys(@CurrentTenant() tenant: TenantContext) {
    return this.keys.list(tenant.organizationId);
  }

  /** يُرجع المفتاح كاملاً **مرة واحدة**. لا مسار يعيد قراءته بعدها. */
  @Post('api-keys')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @ApiOperation({ summary: 'إصدار مفتاح API' })
  async createKey(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(apiKeyCreateSchema)) body: ApiKeyCreateInput,
  ) {
    return this.keys.create(tenant.organizationId, user.id, body);
  }

  @Delete('api-keys/:id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'إبطال مفتاح' })
  async revokeKey(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.keys.revoke(tenant.organizationId, user.id, id);
  }

  // ---------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------

  @Get('webhooks')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @ApiOperation({ summary: 'وجهات Webhook' })
  async listWebhooks(@CurrentTenant() tenant: TenantContext) {
    return this.webhooks.list(tenant.organizationId);
  }

  @Post('webhooks')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @ApiOperation({ summary: 'إضافة وجهة — السرّ يظهر مرة واحدة' })
  async createWebhook(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(webhookEndpointSchema)) body: WebhookEndpointInput,
  ) {
    return this.webhooks.create(tenant.organizationId, user.id, body);
  }

  @Put('webhooks/:id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @ApiOperation({ summary: 'تعديل وجهة وإعادة تفعيلها' })
  async updateWebhook(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(webhookEndpointSchema)) body: WebhookEndpointInput,
  ) {
    return this.webhooks.update(tenant.organizationId, user.id, id, body);
  }

  @Delete('webhooks/:id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'حذف وجهة' })
  async removeWebhook(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.webhooks.remove(tenant.organizationId, user.id, id);
  }

  @Get('webhooks/:id/deliveries')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @ApiOperation({ summary: 'آخر التسليمات وحالتها' })
  async deliveries(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.webhooks.deliveries(tenant.organizationId, id);
  }

  // ---------------------------------------------------------------
  // CRM
  // ---------------------------------------------------------------

  @Get('crm')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @ApiOperation({ summary: 'وصلات CRM وحالتها' })
  async listCrm(@CurrentTenant() tenant: TenantContext) {
    return this.crm.list(tenant.organizationId);
  }

  @Put('crm')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @ApiOperation({ summary: 'ربط CRM أو تعديل خريطته' })
  async upsertCrm(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(crmConnectionSchema)) body: CrmConnectionInput,
  ) {
    return this.crm.upsert(tenant.organizationId, user.id, body);
  }

  @Delete('crm/:id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'فكّ الوصلة' })
  async disconnectCrm(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.crm.disconnect(tenant.organizationId, user.id, id);
  }

  @Get('crm/:id/logs')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @ApiOperation({ summary: 'سجل المزامنة' })
  async crmLogs(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.crm.logs(tenant.organizationId, id);
  }

  @Post('crm/:id/retry')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @ApiOperation({ summary: 'إعادة جدولة ما فشل' })
  async retryCrm(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(crmRetrySchema)) body: CrmRetryInput,
  ) {
    return this.crm.retry(tenant.organizationId, user.id, id, body);
  }

  @Post('crm/:id/sync')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @ApiOperation({ summary: 'جدولة مزامنة كاملة' })
  async syncCrm(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.crm.syncAll(tenant.organizationId, user.id, id);
  }
}
