import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, DirectoryEntry, Paginated, TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import {
  directoryQuerySchema,
  inviteMemberSchema,
  invitationTokenSchema,
  type InviteMemberInput,
} from '@nomiqa/validation';
import type { z } from 'zod';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { NoTenantRequired } from '../tenancy/no-tenant.decorator.js';
import {
  RequirePermissions,
  RequireScopedPermission,
} from '../tenancy/require-permissions.decorator.js';
import { DirectoryService } from './directory.service.js';
import { InvitationsService } from './invitations.service.js';

@ApiTags('teams')
@ApiBearerAuth()
@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @RequireScopedPermission(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @ApiOperation({ summary: 'الدعوات المعلّقة' })
  async list(@CurrentTenant() tenant: TenantContext) {
    return this.invitations.list(tenant);
  }

  /**
   * إنشاء دعوة.
   *
   * الرمز يعود في الاستجابة **مرة واحدة**: البريد هو المسار المعتاد،
   * لكن مسؤولاً في مؤسسة لا يصل بريدها يحتاج نسخ الرابط يدوياً، وبديل
   * ذلك مسار «أظهر لي الرمز» يقرأ رمزاً محفوظاً — وهو ما لا نحفظه.
   */
  @Post()
  @RequireScopedPermission(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @RateLimit({ limit: 60, windowSeconds: 3_600 })
  @ApiOperation({ summary: 'دعوة موظف' })
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMemberInput,
  ) {
    const result = await this.invitations.create(tenant, user.id, body);

    return {
      invitationId: result.invitationId,
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  @Delete(':id')
  @RequireScopedPermission(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'إلغاء دعوة' })
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.invitations.revoke(tenant, user.id, id);
  }
}

/**
 * مسارات المدعو.
 *
 * `@NoTenantRequired` لا `@Public`: المدعو **يجب** أن يكون مصادَقاً
 * عليه — القبول ينشئ عضوية لحساب بعينه — لكنه ليس عضواً في أي مؤسسة
 * بعد، فلا ترويسة مؤسسة يرسلها.
 *
 * حد معدل ضيق: هذان المساران يقبلان رمزاً، وهما المكان الوحيد الذي
 * يمكن تخمين رمز دعوة فيه.
 */
@ApiTags('teams')
@ApiBearerAuth()
@Controller({ path: 'invitations/token', version: '1' })
export class InvitationAcceptanceController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get(':token')
  @NoTenantRequired()
  @RateLimit({ limit: 20, windowSeconds: 300 })
  @ApiOperation({ summary: 'معاينة دعوة برمزها' })
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token', new ZodValidationPipe(invitationTokenSchema)) token: string,
  ) {
    return this.invitations.preview(token, user);
  }

  @Post(':token/accept')
  @NoTenantRequired()
  @RateLimit({ limit: 20, windowSeconds: 300 })
  @ApiOperation({ summary: 'قبول الدعوة' })
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token', new ZodValidationPipe(invitationTokenSchema)) token: string,
  ) {
    return this.invitations.accept(token, user);
  }
}

@ApiTags('teams')
@ApiBearerAuth()
@Controller({ path: 'directory', version: '1' })
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOperation({ summary: 'دليل الموظفين' })
  async search(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(directoryQuerySchema))
    query: z.infer<typeof directoryQuerySchema>,
  ): Promise<Paginated<DirectoryEntry>> {
    return this.directory.search(tenant.organizationId, query);
  }
}
