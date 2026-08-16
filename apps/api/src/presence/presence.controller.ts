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
  campaignReportQuerySchema,
  campaignSchema,
  nfcTagAssignSchema,
  nfcTagCreateSchema,
  nfcTagRevokeSchema,
  shareCodeSchema,
  type CampaignInput,
  type CampaignReportQueryInput,
  type NfcTagAssignInput,
  type NfcTagCreateInput,
  type NfcTagRevokeInput,
} from '@nomiqa/validation';
import { Public } from '../auth/public.decorator.js';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { CampaignsService } from './campaigns.service.js';
import { NfcService } from './nfc.service.js';
import { ShareTargetsService } from './share-targets.service.js';

/**
 * وسوم NFC (§10.2).
 *
 * القراءة والكتابة كلتاهما بـ`presence:manage`، خلافاً لنمط بقية
 * المنصة: قائمة الوسوم تكشف **أين وزّعت المؤسسة حضورها المادي** — من
 * يحمل وسماً وأين يعمل وكم مرة استُخدم. ليست بيانات عرض يستفيد منها
 * كل من يحرّر بطاقة.
 */
@ApiTags('presence')
@ApiBearerAuth()
@Controller({ path: 'nfc/tags', version: '1' })
export class NfcController {
  constructor(private readonly nfc: NfcService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRESENCE_MANAGE)
  @ApiOperation({ summary: 'وسوم NFC للمؤسسة' })
  async list(@CurrentTenant() tenant: TenantContext) {
    return this.nfc.list(tenant.organizationId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRESENCE_MANAGE)
  @ApiOperation({ summary: 'إصدار وسم' })
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(nfcTagCreateSchema)) body: NfcTagCreateInput,
  ) {
    return this.nfc.create(tenant.organizationId, user.id, body);
  }

  @Put(':id/assignment')
  @RequirePermissions(PERMISSIONS.PRESENCE_MANAGE)
  @ApiOperation({ summary: 'ربط الوسم ببطاقة أو فكّه' })
  async assign(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(nfcTagAssignSchema)) body: NfcTagAssignInput,
  ) {
    return this.nfc.assign(tenant.organizationId, user.id, id, body);
  }

  /**
   * إبطال وسم مفقود.
   *
   * `POST` لا `DELETE`: الوسم لا يُحذف — قطعة معدنية ما زالت موجودة في
   * العالم، وحذف صفّها يترك كوداً يعمل في الشارع لا نعرف عنه شيئاً.
   */
  @Post(':id/revocation')
  @RequirePermissions(PERMISSIONS.PRESENCE_MANAGE)
  @ApiOperation({ summary: 'إبطال وسم مفقود وإصدار بديله' })
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(nfcTagRevokeSchema)) body: NfcTagRevokeInput,
  ) {
    return this.nfc.revoke(tenant.organizationId, user.id, id, body);
  }
}

/** الحملات وتقاريرها (§10.4). */
@ApiTags('presence')
@ApiBearerAuth()
@Controller({ path: 'campaigns', version: '1' })
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRESENCE_MANAGE)
  @ApiOperation({ summary: 'حملات المؤسسة' })
  async list(@CurrentTenant() tenant: TenantContext) {
    return this.campaigns.list(tenant.organizationId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRESENCE_MANAGE)
  @ApiOperation({ summary: 'إنشاء حملة' })
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(campaignSchema)) body: CampaignInput,
  ) {
    return this.campaigns.create(tenant.organizationId, user.id, body);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.PRESENCE_MANAGE)
  @ApiOperation({ summary: 'تعديل حملة' })
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(campaignSchema)) body: CampaignInput,
  ) {
    return this.campaigns.update(tenant.organizationId, user.id, id, body);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRESENCE_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'حذف حملة' })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.campaigns.remove(tenant.organizationId, user.id, id);
  }

  /**
   * تقرير الأداء.
   *
   * بصلاحية `analytics:read` لا `presence:manage`: التقرير أرقام قياس
   * لا إعداد، ومن يقرأ تحليلات المؤسسة يقرأ أداء حملاتها.
   */
  @Get(':id/report')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'أداء الحملة' })
  async report(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(campaignReportQuerySchema)) query: CampaignReportQueryInput,
  ) {
    return this.campaigns.report(tenant.organizationId, id, query);
  }
}

/**
 * حل الكود القصير — مسار عام.
 *
 * حدّ المعدل أضيق من حدّ البطاقة العامة (120) وأوسع من حدّ النموذج:
 * الاستدعاء الطبيعي واحد لكل مسح، والمئات في الدقيقة من عنوان واحد
 * ليست استخداماً بل مسحاً منظّماً لفضاء الأكواد.
 */
@ApiTags('public')
@Controller({ path: 'public/share', version: '1' })
export class ShareTargetsController {
  constructor(private readonly targets: ShareTargetsService) {}

  @Get(':code')
  @Public()
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @ApiOperation({ summary: 'ترجمة كود قصير إلى بطاقته' })
  async resolve(@Param('code', new ZodValidationPipe(shareCodeSchema)) code: string) {
    return this.targets.resolve(code);
  }
}
