import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import { uploadRequestSchema, type UploadRequestInput } from '@nomiqa/validation';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import { RequirePermissions } from '../tenancy/require-permissions.decorator.js';
import { FilesService } from './files.service.js';

@ApiTags('files')
@ApiBearerAuth()
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload-url')
  // كل رابط يمنح قدرة كتابة في التخزين — نحدّ من إصدارها بالجملة.
  @RateLimit({ limit: 60, windowSeconds: 3600 })
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @ApiOperation({ summary: 'طلب رابط رفع موقّع' })
  async createUploadUrl(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(uploadRequestSchema)) body: UploadRequestInput,
  ) {
    return this.files.createUploadTicket(tenant.organizationId, user.id, body);
  }

  @Post(':id/confirm')
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @ApiOperation({ summary: 'تأكيد اكتمال الرفع' })
  async confirm(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const file = await this.files.confirmUpload(tenant.organizationId, id);
    return {
      id: file.id,
      purpose: file.purpose,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      status: file.status,
    };
  }

  @Get(':id/download-url')
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'رابط تنزيل موقّع' })
  async downloadUrl(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const url = await this.files.createDownloadUrl(tenant.organizationId, id);
    return { url };
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @ApiOperation({ summary: 'حذف ملف' })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.files.remove(tenant.organizationId, id);
  }
}
