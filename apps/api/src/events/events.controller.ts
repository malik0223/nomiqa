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
import { eventSchema, type EventInput } from '@nomiqa/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { EventReportService } from './event-report.service.js';
import { EventsService } from './events.service.js';

/**
 * الفعاليات وتقاريرها (§11.3).
 *
 * القراءة بـ`contacts:read` والكتابة بـ`events:manage`: كل مندوب في
 * القاعة يحتاج قائمة الفعاليات ليعرف تحت أيّها يسجّل، ولا يحتاج أحدهم
 * أن ينشئ فعالية أو يغيّر نافذتها — تغييرها يعيد رسم تقرير الفريق كله.
 *
 * أما التقرير فبـ`events:manage` وحدها لأنه **يقارن الأعضاء بالاسم**:
 * رقمٌ يقول من جلب أكثر ومن جلب أقل ليس بيانات عمل يقرؤها كل زميل.
 */
@ApiTags('events')
@ApiBearerAuth()
@Controller({ path: 'events', version: '1' })
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly reports: EventReportService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'فعاليات المؤسسة' })
  async list(@CurrentTenant() tenant: TenantContext) {
    return this.events.list(tenant.organizationId);
  }

  @Get(':id/qualifiers')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'حقول تأهيل الفعالية' })
  async qualifiers(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.events.qualifiers(tenant.organizationId, id);
  }

  @Get(':id/report')
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  @ApiOperation({ summary: 'أداء الفعالية ومقارنة الفريق' })
  async report(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.report(tenant.organizationId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  @ApiOperation({ summary: 'إنشاء فعالية' })
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(eventSchema)) body: EventInput,
  ) {
    return this.events.create(tenant.organizationId, user.id, body);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  @ApiOperation({ summary: 'تعديل فعالية' })
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(eventSchema)) body: EventInput,
  ) {
    return this.events.update(tenant.organizationId, user.id, id, body);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'حذف فعالية — جهات الاتصال تبقى' })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.events.remove(tenant.organizationId, user.id, id);
  }
}
