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
  brandKitSchema,
  brandPolicySchema,
  customDomainSchema,
  type BrandKitInput,
  type BrandPolicyInput,
  type CustomDomainInput,
} from '@nomiqa/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { BrandingService } from './branding.service.js';

@ApiTags('branding')
@ApiBearerAuth()
@Controller({ path: 'branding', version: '1' })
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  /**
   * قراءة الهوية بصلاحية `cards:read` لا `branding:manage`.
   *
   * كل من يحرّر بطاقة يحتاج معرفة ألوان مؤسسته وشعارها ليطبّقها؛ قصر
   * القراءة على المسؤول كان سيجعل الهوية غير مرئية لمن يُفترض أن
   * يلتزم بها.
   */
  @Get('kit')
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'هوية المؤسسة البصرية' })
  async getKit(@CurrentTenant() tenant: TenantContext) {
    return this.branding.getBrandKit(tenant.organizationId);
  }

  @Put('kit')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @ApiOperation({ summary: 'تحديث الهوية البصرية' })
  async updateKit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(brandKitSchema)) body: BrandKitInput,
  ) {
    return this.branding.updateBrandKit(tenant.organizationId, user.id, body);
  }

  @Get('policies')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @ApiOperation({ summary: 'سياسات البطاقات' })
  async listPolicies(@CurrentTenant() tenant: TenantContext) {
    return this.branding.listPolicies(tenant.organizationId);
  }

  /** السياسة السارية على بطاقة الموظف نفسه — لعرض الحقول المقفلة في المحرر. */
  @Get('policies/effective')
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'السياسة السارية عليّ' })
  async effectivePolicy(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.branding.effectivePolicyForOwner(tenant.organizationId, user.id);
  }

  @Post('policies')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @ApiOperation({ summary: 'إنشاء سياسة' })
  async createPolicy(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(brandPolicySchema)) body: BrandPolicyInput,
  ) {
    return this.branding.createPolicy(tenant.organizationId, user.id, body);
  }

  @Put('policies/:id')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'تعديل سياسة' })
  async updatePolicy(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(brandPolicySchema)) body: BrandPolicyInput,
  ): Promise<void> {
    await this.branding.updatePolicy(tenant.organizationId, user.id, id, body);
  }

  @Delete('policies/:id')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'حذف سياسة' })
  async deletePolicy(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.branding.deletePolicy(tenant.organizationId, user.id, id);
  }

  @Get('domains')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @ApiOperation({ summary: 'النطاقات المخصصة' })
  async listDomains(@CurrentTenant() tenant: TenantContext) {
    return this.branding.listDomains(tenant.organizationId);
  }

  @Post('domains')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @ApiOperation({ summary: 'إضافة نطاق مخصص' })
  async addDomain(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(customDomainSchema)) body: CustomDomainInput,
  ) {
    return this.branding.addDomain(tenant.organizationId, user.id, body);
  }

  @Delete('domains/:id')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'حذف نطاق مخصص' })
  async removeDomain(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.branding.removeDomain(tenant.organizationId, user.id, id);
  }
}
