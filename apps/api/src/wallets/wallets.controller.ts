import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, TenantContext, WalletPlatform } from '@nomiqa/contracts';
import { WALLET_PLATFORMS } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import { walletIssueSchema, type WalletIssueInput } from '@nomiqa/validation';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { WalletsService } from './wallets.service.js';

/**
 * بطاقات المحافظ الرقمية (§10.2).
 *
 * بصلاحية `cards:write` لا `presence:manage`: بطاقة المحفظة نسخة من
 * بطاقة صاحبها في هاتفه هو، لا أصلٌ يُوزَّع على غيره كوسم NFC.
 */
@ApiTags('presence')
@ApiBearerAuth()
@Controller({ path: 'wallets', version: '1' })
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get('availability')
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'المنصات المضبوطة على هذه المنصة' })
  availability() {
    return this.wallets.availability();
  }

  @Post('issue')
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @ApiOperation({ summary: 'إصدار بطاقة محفظة' })
  async issue(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(walletIssueSchema)) body: WalletIssueInput,
  ) {
    return this.wallets.issue(tenant.organizationId, user.id, body);
  }

  /**
   * تنزيل حزمة Apple.
   *
   * `Cache-Control: no-store` إلزامي: الحزمة موقَّعة وتحمل رمز مصادقة
   * خدمة التحديث. نسخة منها في ذاكرة وسيط مشترك تسلّم ذلك الرمز لمن
   * يطلب الرابط نفسه لاحقاً.
   */
  @Get(':cardId/apple')
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @Header('Content-Type', 'application/vnd.apple.pkpass')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'تنزيل حزمة Apple Wallet' })
  async applePass(
    @CurrentTenant() tenant: TenantContext,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { filename, body } = await this.wallets.applePkpass(tenant.organizationId, cardId);

    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send(body);
  }

  @Delete(':cardId/:platform')
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @HttpCode(204)
  @ApiOperation({ summary: 'إبطال بطاقة محفظة' })
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('platform', new ZodValidationPipe(z.enum(WALLET_PLATFORMS))) platform: WalletPlatform,
  ): Promise<void> {
    await this.wallets.revoke(tenant.organizationId, user.id, cardId, platform);
  }
}
