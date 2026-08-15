import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, ConsentStatus, UserDataExport } from '@nomiqa/contracts';
import { consentUpdateSchema, type ConsentUpdateInput } from '@nomiqa/validation';
import type { Request } from 'express';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from '../tenancy/current.decorators.js';
import { NoTenantRequired } from '../tenancy/no-tenant.decorator.js';
import { AccountService } from './account.service.js';
import { ConsentsService } from './consents.service.js';

/**
 * حقوق صاحب البيانات.
 *
 * كل المسارات هنا `@NoTenantRequired`: الحقوق تخص المستخدم كشخص لا
 * كعضو في مؤسسة، فاشتراط مؤسسة نشطة يمنعه من ممارستها بعد تعطيل
 * عضويته — وهو بالضبط الوقت الذي يحتاجها فيه.
 */
@ApiTags('privacy')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class PrivacyController {
  constructor(
    private readonly consents: ConsentsService,
    private readonly account: AccountService,
  ) {}

  @NoTenantRequired()
  @Get('consents')
  @ApiOperation({ summary: 'حالة الموافقات الحالية' })
  async listConsents(@CurrentUser() user: AuthenticatedUser): Promise<ConsentStatus[]> {
    const state = await this.consents.currentState(user.id);

    return state.map((item) => ({
      purpose: item.purpose,
      granted: item.granted,
      documentVersion: item.documentVersion,
      currentVersion: item.currentVersion,
      updatedAt: item.updatedAt?.toISOString() ?? null,
    }));
  }

  @NoTenantRequired()
  @Post('consents')
  @ApiOperation({ summary: 'تسجيل موافقة أو سحبها' })
  async updateConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(consentUpdateSchema)) body: ConsentUpdateInput,
    @Req() request: Request,
  ): Promise<{ ok: true }> {
    await this.consents.record({
      userId: user.id,
      purpose: body.purpose,
      granted: body.granted,
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    });

    return { ok: true };
  }

  @NoTenantRequired()
  @Get('export')
  // التصدير يقرأ كل بيانات المستخدم — مكلف ولا يُستدعى بتواتر.
  @RateLimit({ limit: 5, windowSeconds: 3600 })
  @ApiOperation({ summary: 'تنزيل نسخة من بيانات المستخدم' })
  async exportData(@CurrentUser() user: AuthenticatedUser): Promise<UserDataExport> {
    return this.account.exportData(user.id);
  }

  @NoTenantRequired()
  @Get('requests')
  @ApiOperation({ summary: 'طلبات صاحب البيانات السابقة' })
  async listRequests(@CurrentUser() user: AuthenticatedUser) {
    const requests = await this.account.listRequests(user.id);

    return requests.map((request) => ({
      id: request.id,
      type: request.type,
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      completedAt: request.completedAt?.toISOString() ?? null,
    }));
  }

  /**
   * حذف الحساب. عملية غير قابلة للتراجع.
   *
   * POST لا DELETE عمداً: DELETE على `/me` يوحي بعملية فورية بسيطة،
   * بينما هذه تبدأ سلسلة حذف عبر أنظمة متعددة وتُنفَّذ في الخلفية.
   */
  @NoTenantRequired()
  @Post('account/deletion')
  // حد ضيق: عملية لا رجعة فيها، ولا سبب مشروع لتكرارها.
  @RateLimit({ limit: 3, windowSeconds: 3600 })
  @HttpCode(202)
  @ApiOperation({ summary: 'طلب حذف الحساب نهائياً' })
  async requestDeletion(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ requestId: string; status: 'accepted' }> {
    const { requestId } = await this.account.requestDeletion(user.id);
    return { requestId, status: 'accepted' };
  }
}
