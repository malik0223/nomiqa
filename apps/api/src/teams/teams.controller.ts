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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import {
  createBranchSchema,
  createDepartmentSchema,
  employeeImportOptionsSchema,
  grantScopeSchema,
  memberListQuerySchema,
  offboardMemberSchema,
  updateBranchSchema,
  updateDepartmentSchema,
  updateMemberSchema,
  type EmployeeImportOptionsInput,
  type OffboardMemberInput,
  type UpdateMemberInput,
} from '@nomiqa/validation';
import { z } from 'zod';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import {
  RequirePermissions,
  RequireScopedPermission,
} from '../tenancy/require-permissions.decorator.js';
import { EmployeeImportService } from './employee-import.service.js';
import { MembersService } from './members.service.js';
import { UnitsService } from './units.service.js';

/**
 * حجم ملف الاستيراد.
 *
 * يُفحص هنا لا في الوسيط وحده: ملفان بمليون سطر يصلان معاً كافيان
 * لإشباع الذاكرة قبل أن يصل أيٌّ منهما إلى المحلّل.
 */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const importBodySchema = z.object({
  options: employeeImportOptionsSchema,
  /** محتوى الملف نصاً — الملف لا يُخزَّن، فلا حاجة لمسار رفع. */
  content: z.string().min(1).max(MAX_IMPORT_BYTES, 'الملف أكبر من الحد المسموح'),
});

@ApiTags('teams')
@ApiBearerAuth()
@Controller({ path: 'teams', version: '1' })
export class TeamsController {
  constructor(
    private readonly units: UnitsService,
    private readonly members: MembersService,
    private readonly imports: EmployeeImportService,
  ) {}

  // ---------------------------------------------------------------
  // الإدارات والفروع
  // ---------------------------------------------------------------

  @Get('departments')
  @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOperation({ summary: 'شجرة الإدارات' })
  async departments(@CurrentTenant() tenant: TenantContext) {
    return this.units.listDepartments(tenant.organizationId);
  }

  @Post('departments')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'إنشاء إدارة' })
  async createDepartment(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createDepartmentSchema))
    body: z.infer<typeof createDepartmentSchema>,
  ) {
    return this.units.createDepartment(tenant.organizationId, body);
  }

  @Patch('departments/:id')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'تعديل إدارة' })
  async updateDepartment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDepartmentSchema))
    body: z.infer<typeof updateDepartmentSchema>,
  ): Promise<void> {
    await this.units.updateDepartment(tenant.organizationId, id, body);
  }

  @Delete('departments/:id')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'حذف إدارة' })
  async deleteDepartment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.units.deleteDepartment(tenant.organizationId, id);
  }

  @Get('branches')
  @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOperation({ summary: 'الفروع' })
  async branches(@CurrentTenant() tenant: TenantContext) {
    return this.units.listBranches(tenant.organizationId);
  }

  @Post('branches')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'إنشاء فرع' })
  async createBranch(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createBranchSchema)) body: z.infer<typeof createBranchSchema>,
  ) {
    return this.units.createBranch(tenant.organizationId, body);
  }

  @Patch('branches/:id')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'تعديل فرع' })
  async updateBranch(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: z.infer<typeof updateBranchSchema>,
  ): Promise<void> {
    await this.units.updateBranch(tenant.organizationId, id, body);
  }

  @Delete('branches/:id')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'حذف فرع' })
  async deleteBranch(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.units.deleteBranch(tenant.organizationId, id);
  }

  // ---------------------------------------------------------------
  // الأعضاء
  // ---------------------------------------------------------------

  /**
   * قائمة الأعضاء.
   *
   * `@RequireScopedPermission` لا `@RequirePermissions`: مسؤول الإدارة
   * يفتح الشاشة ويرى **أعضاء إدارته وحدهم** — التصفية في الخدمة.
   */
  @Get('members')
  @RequireScopedPermission(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @ApiOperation({ summary: 'أعضاء المؤسسة' })
  async listMembers(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(memberListQuerySchema))
    query: z.infer<typeof memberListQuerySchema>,
  ) {
    return this.members.list(tenant, query);
  }

  @Patch('members/:id')
  @RequireScopedPermission(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'تعديل عضو' })
  async updateMember(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberInput,
  ): Promise<void> {
    await this.members.update(tenant, user.id, id, body);
  }

  @Post('members/:id/offboard')
  @RequireScopedPermission(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'إنهاء خدمة موظف' })
  async offboard(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(offboardMemberSchema)) body: OffboardMemberInput,
  ): Promise<void> {
    await this.members.offboard(tenant, user.id, id, body);
  }

  @Post('members/:id/reinstate')
  @RequireScopedPermission(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'إعادة تفعيل عضوية' })
  async reinstate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.members.reinstate(tenant, user.id, id);
  }

  /**
   * منح تفويض محدود.
   *
   * `@RequirePermissions` على المؤسسة كلها: التفويض المحدود لا يمنح
   * تفويضاً محدوداً آخر.
   */
  @Post('members/:id/scopes')
  @RequirePermissions(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'منح تفويض على إدارة أو فرع' })
  async grantScope(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(grantScopeSchema)) body: z.infer<typeof grantScopeSchema>,
  ): Promise<void> {
    await this.members.grantScope(tenant, user.id, id, body.role, body.scopeType, body.scopeId);
  }

  @Delete('members/:id/scopes/:scopeId')
  @RequirePermissions(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @HttpCode(204)
  @ApiOperation({ summary: 'سحب تفويض' })
  async revokeScope(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scopeId', ParseUUIDPipe) scopeId: string,
  ): Promise<void> {
    await this.members.revokeScope(tenant, user.id, id, scopeId);
  }

  // ---------------------------------------------------------------
  // الاستيراد الجماعي
  // ---------------------------------------------------------------

  @Post('imports')
  @RequirePermissions(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @RateLimit({ limit: 5, windowSeconds: 3_600 })
  @ApiOperation({ summary: 'استيراد موظفين من ملف CSV' })
  async startImport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(importBodySchema))
    body: { options: EmployeeImportOptionsInput; content: string },
  ) {
    return this.imports.start(tenant.organizationId, user.id, body.options, body.content);
  }

  @Get('imports')
  @RequirePermissions(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @ApiOperation({ summary: 'دفعات الاستيراد الأخيرة' })
  async listImports(@CurrentTenant() tenant: TenantContext) {
    return this.imports.list(tenant.organizationId);
  }

  @Get('imports/:id')
  @RequirePermissions(PERMISSIONS.ORG_MEMBERS_MANAGE)
  @ApiOperation({ summary: 'حالة دفعة استيراد' })
  async getImport(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.get(tenant.organizationId, id);
  }
}
