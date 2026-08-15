import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import {
  createCardSchema,
  slugSchema,
  updateCardSchema,
  type CreateCardInput,
  type UpdateCardInput,
} from '@nomiqa/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { CardsService } from './cards.service.js';

@ApiTags('cards')
@ApiBearerAuth()
@Controller({ path: 'cards', version: '1' })
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'بطاقات المؤسسة' })
  async list(@CurrentTenant() tenant: TenantContext) {
    return this.cards.list(tenant.organizationId);
  }

  @Get('entitlements')
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'حصة البطاقات المتبقية' })
  async entitlements(@CurrentTenant() tenant: TenantContext) {
    return this.cards.entitlements(tenant.organizationId);
  }

  @Get('templates')
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'القوالب المتاحة' })
  async templates() {
    return this.cards.listTemplates();
  }

  /**
   * فحص توفر الرابط.
   *
   * `cards:write` لا `cards:read`: هذا المسار يكشف — بقيمة منطقية —
   * ما إذا كان رابط ما مأخوذاً عبر كل المؤسسات، فلا يُفتح إلا لمن
   * يملك أصلاً حق إنشاء بطاقة.
   */
  @Get('slug-availability')
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @ApiOperation({ summary: 'هل الرابط متاح؟' })
  async slugAvailability(@Query('slug', new ZodValidationPipe(slugSchema)) slug: string) {
    return { slug, available: await this.cards.isSlugAvailable(slug) };
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'تفاصيل بطاقة' })
  async get(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.cards.get(tenant.organizationId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @ApiOperation({ summary: 'إنشاء بطاقة' })
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCardSchema)) body: CreateCardInput,
    @Req() request: Request,
  ) {
    return this.cards.create(tenant.organizationId, user.id, body, request.requestId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @ApiOperation({ summary: 'تعديل بطاقة' })
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCardSchema)) body: UpdateCardInput,
  ) {
    return this.cards.update(tenant.organizationId, user.id, id, body);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.CARDS_PUBLISH)
  @ApiOperation({ summary: 'نشر البطاقة' })
  async publish(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.cards.publish(tenant.organizationId, user.id, id, request.requestId);
  }

  @Post(':id/unpublish')
  @RequirePermissions(PERMISSIONS.CARDS_PUBLISH)
  @ApiOperation({ summary: 'إلغاء النشر' })
  async unpublish(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cards.unpublish(tenant.organizationId, user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @ApiOperation({ summary: 'حذف بطاقة' })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.cards.remove(tenant.organizationId, user.id, id);
  }
}
