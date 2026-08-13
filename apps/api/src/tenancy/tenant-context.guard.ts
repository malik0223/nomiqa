import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { TenantContext } from '@nomiqa/contracts';
import { IS_PUBLIC_KEY } from '../auth/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const ORGANIZATION_HEADER = 'x-organization-id';

/**
 * يحدّد المؤسسة النشطة للطلب ويتحقق من عضوية المستخدم فيها.
 *
 * هذه هي **الطبقة الثانية** من طبقات العزل الست (§6.3):
 *   1. Tenant Context على مستوى الطلب  ← هنا
 *   2. التحقق من العضوية والصلاحية      ← هنا
 *   3. تقييد الاستعلامات في Repository
 *   4. RLS في PostgreSQL
 *   5. اختبارات عزل آلية
 *   6. سجل تدقيق
 *
 * العضوية تُقرأ من قاعدة بياناتنا في كل طلب — لا من الـToken —
 * حتى يمنع تعطيل العضوية الوصول فوراً دون انتظار انتهاء الرمز.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('لا يوجد مستخدم مصادق عليه');
    }

    const organizationId = request.header(ORGANIZATION_HEADER);
    if (!organizationId) {
      throw new ForbiddenException(`ترويسة ${ORGANIZATION_HEADER} مطلوبة`);
    }

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });

    // نفس الرسالة للعضوية غير الموجودة وللمعطّلة، حتى لا تكشف
    // الاستجابة وجود مؤسسة بمعرّف معيّن.
    if (!membership || membership.status !== 'active' || membership.revokedAt !== null) {
      throw new ForbiddenException('لا تملك وصولاً إلى هذه المؤسسة');
    }

    const roles = membership.roles.map((link) => link.role.key);
    const permissions = [
      ...new Set(
        membership.roles.flatMap((link) =>
          link.role.permissions.map((rolePermission) => rolePermission.permission.key),
        ),
      ),
    ];

    const tenant: TenantContext = {
      organizationId,
      membershipId: membership.id,
      roles,
      permissions,
    };

    request.tenant = tenant;
    return true;
  }
}
