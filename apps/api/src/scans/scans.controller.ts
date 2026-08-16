import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import {
  qrScanSchema,
  scanConfirmSchema,
  scanCreateSchema,
  type QrScanInput,
  type ScanConfirmInput,
  type ScanCreateInput,
} from '@nomiqa/validation';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { ScansService } from './scans.service.js';

/**
 * مسح البطاقات والشارات (§11.2).
 *
 * الصلاحية `contacts:read` لكل المسارات: من يلتقط جهات الاتصال هو من
 * يقرؤها، ومندوب المبيعات في القاعة يملكها أصلاً. صلاحية ثالثة خاصة
 * بالمسح كانت ستعني مسؤولاً يوزّعها على الفريق صباح المعرض.
 */
@ApiTags('scans')
@ApiBearerAuth()
@Controller({ path: 'scans', version: '1' })
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Get('availability')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'جاهزية المسح والاستخراج' })
  async availability(@CurrentTenant() tenant: TenantContext) {
    return this.scans.availability(tenant.organizationId);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'مسوحاتي المعلّقة للمراجعة' })
  async list(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser) {
    return this.scans.list(tenant.organizationId, user.id);
  }

  /**
   * يبدأ استخراج صورة مرفوعة.
   *
   * حدّ معدل أضيق من الافتراضي: كل استدعاء ينتج نداءً مدفوعاً إلى محرك
   * خارجي. الوتيرة البشرية في معرض مزدحم بطاقة كل بضع ثوانٍ، وستون في
   * الدقيقة تسع أسرع مندوب وتوقف أي حلقة آلية.
   */
  @Post()
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @RateLimit({ limit: 60, windowSeconds: 60 })
  @ApiOperation({ summary: 'بدء استخراج بطاقة ممسوحة' })
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(scanCreateSchema)) body: ScanCreateInput,
  ) {
    return this.scans.create(tenant.organizationId, user.id, body);
  }

  @Post('qr')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @RateLimit({ limit: 60, windowSeconds: 60 })
  @ApiOperation({ summary: 'قراءة رمز QR من منصة أخرى' })
  async scanQr(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(qrScanSchema)) body: QrScanInput,
  ) {
    return this.scans.scanQr(tenant.organizationId, user.id, body);
  }

  @Post(':id/contact')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'حفظ ما رُوجع جهةَ اتصال' })
  async confirm(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(scanConfirmSchema)) body: ScanConfirmInput,
  ) {
    return this.scans.confirm(tenant.organizationId, user.id, id, body);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @HttpCode(204)
  @ApiOperation({ summary: 'إهمال مسح وحذف صورته' })
  async discard(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.scans.discard(tenant.organizationId, user.id, id);
  }
}
