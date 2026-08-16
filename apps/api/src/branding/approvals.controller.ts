import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, ChangeRequestStatus, TenantContext } from '@nomiqa/contracts';
import { PERMISSIONS } from '@nomiqa/database';
import {
  paginationSchema,
  reviewChangeRequestSchema,
  updateCardSchema,
  type ReviewChangeRequestInput,
  type UpdateCardInput,
} from '@nomiqa/validation';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, CurrentUser } from '../tenancy/current.decorators.js';
import {
  RequirePermissions,
  RequireScopedPermission,
} from '../tenancy/require-permissions.decorator.js';
import { ApprovalsService } from './approvals.service.js';

const listQuerySchema = paginationSchema.extend({
  status: z
    .enum(['pending', 'approved', 'rejected', 'withdrawn', 'stale', 'all'])
    .default('pending'),
});

@ApiTags('branding')
@ApiBearerAuth()
@Controller({ path: 'change-requests', version: '1' })
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  /**
   * طلبات الموظف نفسه.
   *
   * `cards:read` تكفي: هذه طلباته هو، ومنعها عمّن لا يملك صلاحية
   * موافقة كان سيخفي عن الموظف مصير ما أرسله.
   */
  @Get('mine')
  @RequirePermissions(PERMISSIONS.CARDS_READ)
  @ApiOperation({ summary: 'طلباتي' })
  async mine(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser) {
    return this.approvals.listMine(tenant, user.id);
  }

  @Get()
  @RequireScopedPermission(PERMISSIONS.CARDS_APPROVE)
  @ApiOperation({ summary: 'طلبات التعديل بانتظار المراجعة' })
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ) {
    return this.approvals.list(
      tenant,
      query.status as ChangeRequestStatus | 'all',
      query.page,
      query.pageSize,
    );
  }

  @Get(':id')
  @RequireScopedPermission(PERMISSIONS.CARDS_APPROVE)
  @ApiOperation({ summary: 'تفاصيل طلب مع القيم الحالية' })
  async get(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.get(tenant, id);
  }

  /**
   * تقديم طلب تعديل.
   *
   * `cards:write` لا `cards:approve`: هذا مسار الموظف الذي رُفض تعديله
   * لحقل مقفل، وهو يملك حق التعديل — القفل قيّده ولم يلغه.
   */
  @Post('cards/:cardId')
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @ApiOperation({ summary: 'تقديم طلب تعديل بطاقة' })
  async submit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body(new ZodValidationPipe(updateCardSchema)) body: UpdateCardInput,
  ) {
    return this.approvals.submit(tenant, user.id, cardId, body);
  }

  @Post(':id/review')
  @RequireScopedPermission(PERMISSIONS.CARDS_APPROVE)
  @ApiOperation({ summary: 'الموافقة على طلب أو رفضه' })
  async review(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewChangeRequestSchema)) body: ReviewChangeRequestInput,
  ) {
    return this.approvals.review(tenant, user.id, id, body.decision, body.note ?? null);
  }

  @Post(':id/withdraw')
  @RequirePermissions(PERMISSIONS.CARDS_WRITE)
  @HttpCode(204)
  @ApiOperation({ summary: 'سحب طلب' })
  async withdraw(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.approvals.withdraw(tenant, user.id, id);
  }
}
