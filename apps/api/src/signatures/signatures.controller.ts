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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import {
  meetingBackgroundQuerySchema,
  signatureProfileSchema,
  signatureRenderQuerySchema,
  signatureTemplateSchema,
  type MeetingBackgroundQueryInput,
  type SignatureProfileInput,
  type SignatureRenderQueryInput,
  type SignatureTemplateInput,
} from '@nomiqa/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { SignaturesService } from './signatures.service.js';

/**
 * توقيع البريد وخلفيات الاجتماعات (§10.3).
 *
 * تقسيم الصلاحيات هنا يعكس §10.5 حرفياً:
 *  - **القوالب المركزية** بـ`branding:manage`: التوقيع أكثر ما يظهر من
 *    هوية المؤسسة خارجها، فيديره من يدير الهوية.
 *  - **توقيع الموظف نفسه** بـ`cards:write`: من يحرّر بطاقته يختار كيف
 *    تظهر في بريده.
 */
@ApiTags('presence')
@ApiBearerAuth()
@Controller({ path: 'signatures', version: '1' })
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Get('templates')
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'قوالب التوقيع المؤسسية' })
  async listTemplates(@CurrentTenant() tenant: TenantContext) {
    return this.signatures.listTemplates(tenant.organizationId);
  }

  @Post('templates')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @ApiOperation({ summary: 'إنشاء قالب توقيع مؤسسي' })
  async createTemplate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(signatureTemplateSchema)) body: SignatureTemplateInput,
  ) {
    return this.signatures.createTemplate(tenant.organizationId, user.id, body);
  }

  @Put('templates/:id')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @ApiOperation({ summary: 'تعديل قالب توقيع' })
  async updateTemplate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(signatureTemplateSchema)) body: SignatureTemplateInput,
  ) {
    return this.signatures.updateTemplate(tenant.organizationId, user.id, id, body);
  }

  @Delete('templates/:id')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'حذف قالب توقيع' })
  async deleteTemplate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.signatures.deleteTemplate(tenant.organizationId, user.id, id);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'التوقيع الجاهز للّصق' })
  async render(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(signatureRenderQuerySchema)) query: SignatureRenderQueryInput,
  ) {
    return this.signatures.render(tenant.organizationId, query);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @ApiOperation({ summary: 'حفظ اختيار التوقيع' })
  async saveProfile(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(signatureProfileSchema)) body: SignatureProfileInput,
  ) {
    return this.signatures.saveProfile(tenant.organizationId, body);
  }
}

/** خلفيات Zoom وTeams وMeet المولَّدة من البطاقة (§10.3). */
@ApiTags('presence')
@ApiBearerAuth()
@Controller({ path: 'meeting-backgrounds', version: '1' })
export class MeetingBackgroundsController {
  constructor(private readonly signatures: SignaturesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'خلفية اجتماع بصيغة SVG' })
  async background(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(meetingBackgroundQuerySchema)) query: MeetingBackgroundQueryInput,
  ) {
    return this.signatures.meetingBackground(tenant.organizationId, query);
  }
}
