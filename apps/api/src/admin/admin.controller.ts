import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@nomiqa/contracts';
import {
  featureFlagOverrideSchema,
  featureFlagUpdateSchema,
  paginationSchema,
  type FeatureFlagOverrideInput,
  type FeatureFlagUpdateInput,
} from '@nomiqa/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service.js';
import { CurrentUser } from '../tenancy/current.decorators.js';
import { NoTenantRequired } from '../tenancy/no-tenant.decorator.js';
import { AdminService } from './admin.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

/**
 * لوحة إدارة المنصة.
 *
 * مبدأ حاكم: **لا تقرأ هذه المسارات بيانات أعمال أي مؤسسة.** ما
 * تعرضه بيانات وصفية وأعداد مجمّعة فقط. الاطلاع على محتوى مؤسسة
 * يحتاج طلباً موثّقاً من صاحبها، لا نقرة في لوحة.
 */
@ApiTags('admin')
@ApiBearerAuth()
@NoTenantRequired()
@UseGuards(PlatformAdminGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'إجماليات المنصة' })
  async stats() {
    return this.admin.platformTotals();
  }

  @Get('organizations')
  @ApiOperation({ summary: 'قائمة المؤسسات — بيانات وصفية وأعداد فقط' })
  async organizations(@Query() query: Record<string, string>) {
    const pagination = paginationSchema.parse(query);
    return this.admin.listOrganizations(pagination.page, pagination.pageSize);
  }

  @Get('feature-flags')
  @ApiOperation({ summary: 'رايات الميزات' })
  async listFlags() {
    return this.flags.list();
  }

  @Patch('feature-flags/:key')
  @ApiOperation({ summary: 'تعديل راية' })
  async updateFlag(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(featureFlagUpdateSchema)) body: FeatureFlagUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const updated = await this.flags.update(key, body);

    await this.admin.audit(user.id, {
      action: 'feature_flag.updated',
      resourceType: 'feature_flag',
      resourceId: key,
      metadata: body,
      requestId: request.requestId,
      ipAddress: request.ip,
    });

    return updated;
  }

  @Put('feature-flags/:key/overrides')
  @ApiOperation({ summary: 'استثناء مؤسسة من راية' })
  async setOverride(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(featureFlagOverrideSchema)) body: FeatureFlagOverrideInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const result = await this.flags.setOverride(key, body.organizationId, body.enabled);

    await this.admin.audit(user.id, {
      action: 'feature_flag.override_set',
      resourceType: 'feature_flag',
      resourceId: key,
      metadata: { organizationId: body.organizationId, enabled: body.enabled },
      requestId: request.requestId,
      ipAddress: request.ip,
    });

    return result;
  }

  @Delete('feature-flags/:key/overrides/:organizationId')
  @HttpCode(204)
  @ApiOperation({ summary: 'إزالة استثناء' })
  async clearOverride(
    @Param('key') key: string,
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.flags.clearOverride(key, organizationId);

    await this.admin.audit(user.id, {
      action: 'feature_flag.override_cleared',
      resourceType: 'feature_flag',
      resourceId: key,
      metadata: { organizationId },
      requestId: request.requestId,
      ipAddress: request.ip,
    });
  }

  @Get('audit')
  @ApiOperation({ summary: 'سجل عمليات الإدارة' })
  async audit(@Query() query: Record<string, string>) {
    const pagination = paginationSchema.parse(query);
    return this.admin.listAudit(pagination.page, pagination.pageSize);
  }
}
