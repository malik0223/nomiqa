import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import { createTicketSchema, replyToTicketSchema, type CreateTicketInput } from '@nomiqa/validation';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { SupportService } from './support.service.js';

@ApiTags('support')
@ApiBearerAuth()
@Controller({ path: 'support/tickets', version: '1' })
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPORT_MANAGE)
  @ApiOperation({ summary: 'تذاكر الدعم' })
  async list(@CurrentTenant() tenant: TenantContext) {
    return this.support.list(tenant.organizationId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SUPPORT_MANAGE)
  @ApiOperation({ summary: 'تفاصيل تذكرة' })
  async get(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.get(tenant.organizationId, id);
  }

  /**
   * فتح تذكرة.
   *
   * حد معدل ضيق: التذاكر تصل إلى بشر، وفيضٌ منها يعطّل الدعم عن
   * العملاء الآخرين لا عن المسيء وحده.
   */
  @Post()
  @RequirePermissions(PERMISSIONS.SUPPORT_MANAGE)
  @RateLimit({ limit: 10, windowSeconds: 3_600 })
  @ApiOperation({ summary: 'فتح تذكرة دعم' })
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTicketSchema)) body: CreateTicketInput,
  ) {
    return this.support.create(tenant.organizationId, user.id, body);
  }

  @Post(':id/reply')
  @RequirePermissions(PERMISSIONS.SUPPORT_MANAGE)
  @RateLimit({ limit: 30, windowSeconds: 3_600 })
  @HttpCode(204)
  @ApiOperation({ summary: 'الرد على تذكرة' })
  async reply(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replyToTicketSchema)) body: { body: string },
  ): Promise<void> {
    await this.support.reply(tenant.organizationId, user.id, id, body.body);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.SUPPORT_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'إغلاق تذكرة' })
  async close(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.support.close(tenant.organizationId, id);
  }
}
