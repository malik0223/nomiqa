import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import {
  contactCreateSchema,
  contactNoteSchema,
  contactQuerySchema,
  contactUpdateSchema,
  followUpTaskSchema,
  followUpTaskUpdateSchema,
  tagSchema,
  type ContactCreateInput,
  type ContactNoteInput,
  type ContactQueryInput,
  type ContactUpdateInput,
  type FollowUpTaskInput,
  type TagInput,
} from '@nomiqa/validation';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { ContactsService } from './contacts.service.js';

@ApiTags('contacts')
@ApiBearerAuth()
@Controller({ path: 'contacts', version: '1' })
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'قائمة جهات الاتصال' })
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(contactQuerySchema)) query: ContactQueryInput,
  ) {
    return this.contacts.list(tenant.organizationId, query);
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'ملخص جهات الاتصال' })
  async stats(@CurrentTenant() tenant: TenantContext) {
    return this.contacts.stats(tenant.organizationId);
  }

  @Get('tags')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'تصنيفات المؤسسة' })
  async tags(@CurrentTenant() tenant: TenantContext) {
    return this.contacts.listTags(tenant.organizationId);
  }

  /**
   * التصدير.
   *
   * `contacts:export` لا `contacts:read`: إخراج آلاف الصفوف من بيانات
   * أطراف ثالثة في ملف يغادر المنصة صلاحية مستقلة عن تصفّح القائمة.
   */
  @Get('export')
  @RequirePermissions(PERMISSIONS.CONTACTS_EXPORT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="contacts.csv"')
  // لا تخزين مؤقت لملف يحمل بيانات شخصية، ولا حتى في وسيط.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'تصدير جهات الاتصال إلى CSV' })
  async exportCsv(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(contactQuerySchema)) query: ContactQueryInput,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.contacts.exportCsv(tenant.organizationId, user.id, query);
    response.send(csv);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'تفاصيل جهة اتصال' })
  async get(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.contacts.get(tenant.organizationId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'إضافة جهة اتصال يدوياً' })
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(contactCreateSchema)) body: ContactCreateInput,
  ) {
    return this.contacts.create(tenant.organizationId, user.id, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'تعديل جهة اتصال' })
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(contactUpdateSchema)) body: ContactUpdateInput,
  ) {
    return this.contacts.update(tenant.organizationId, user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'حذف جهة اتصال' })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.contacts.remove(tenant.organizationId, user.id, id);
  }

  // ---------------- الملاحظات ----------------

  @Post(':id/notes')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'إضافة ملاحظة' })
  async addNote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(contactNoteSchema)) body: ContactNoteInput,
  ) {
    return this.contacts.addNote(tenant.organizationId, user.id, id, body);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'حذف ملاحظة' })
  async removeNote(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ): Promise<void> {
    await this.contacts.removeNote(tenant.organizationId, id, noteId);
  }

  // ---------------- تذكيرات المتابعة ----------------

  @Post(':id/follow-ups')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'إضافة تذكير متابعة' })
  async addFollowUp(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(followUpTaskSchema)) body: FollowUpTaskInput,
  ) {
    return this.contacts.addFollowUp(tenant.organizationId, id, body);
  }

  @Patch(':id/follow-ups/:taskId')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'تحديث حالة تذكير' })
  async updateFollowUp(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body(new ZodValidationPipe(followUpTaskUpdateSchema))
    body: z.infer<typeof followUpTaskUpdateSchema>,
  ) {
    return this.contacts.setFollowUpStatus(tenant.organizationId, id, taskId, body.status);
  }
}

/**
 * التصنيفات في متحكّم منفصل.
 *
 * مورد مستقل لا تابع لجهة اتصال: يُنشأ ويُحذف بذاته، ووضعه تحت
 * `/contacts/:id` كان سيجعل مساره يكذب على من يقرأه.
 */
@ApiTags('contacts')
@ApiBearerAuth()
@Controller({ path: 'tags', version: '1' })
export class TagsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'قائمة التصنيفات' })
  async list(@CurrentTenant() tenant: TenantContext) {
    return this.contacts.listTags(tenant.organizationId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'إنشاء تصنيف' })
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(tagSchema)) body: TagInput,
  ) {
    return this.contacts.createTag(tenant.organizationId, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'تعديل تصنيف' })
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(tagSchema)) body: TagInput,
  ) {
    return this.contacts.updateTag(tenant.organizationId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTACTS_READ)
  @ApiOperation({ summary: 'حذف تصنيف' })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.contacts.removeTag(tenant.organizationId, id);
  }
}
