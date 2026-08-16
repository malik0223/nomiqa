import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OUTBOX_EVENT_TYPES,
  type MemberScope,
  type MemberSummary,
  type Paginated,
  type ScopeType,
  type TenantContext,
} from '@nomiqa/contracts';
import { Prisma, SYSTEM_ROLES, withRlsContext, type TenantScopedClient } from '@nomiqa/database';
import type { OffboardMemberInput, UpdateMemberInput } from '@nomiqa/validation';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertScopeCovers, scopeFilter, withScope } from '../tenancy/scope.js';

/**
 * إدارة الأعضاء (خارطة الطريق §9.2).
 *
 * كل عملية تمس عضواً بعينه تمر بتحقق النطاق: مسؤول الإدارة يجتاز
 * الحارس، وهنا يُقاس الصف المستهدف على تفويضه. تجاهل هذا التحقق في
 * أي مسار جديد يعني تفويضاً محدوداً صار شاملاً بصمت.
 */
@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenant: TenantContext,
    query: {
      q?: string;
      departmentId?: string;
      branchId?: string;
      status: 'active' | 'revoked' | 'all';
      page: number;
      pageSize: number;
    },
  ): Promise<Paginated<MemberSummary>> {
    const scope = scopeFilter(tenant, 'members:manage');

    // النطاق والبحث يُركَّبان في `AND` لا يُنثران في الكائن نفسه: كلاهما
    // يستخدم `OR`، والنثر كان يجعل البحث يدهس قيد النطاق فيرى مسؤول
    // الإدارة كل موظفي المؤسسة بمجرد كتابة حرف في مربع البحث.
    const where: Prisma.OrganizationMembershipWhereInput = {
      ...(query.status === 'all' ? {} : { status: query.status }),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...withScope(
        scope,
        query.q
          ? {
              OR: [
                { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
                { user: { email: { contains: query.q, mode: 'insensitive' } } },
                { employeeNo: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : undefined,
      ),
    };

    const { rows, total, cardCounts } = await withRlsContext(
      this.prisma,
      { organizationId: tenant.organizationId },
      async (tx) => ({
        rows: await tx.organizationMembership.findMany({
          where,
          orderBy: { createdAt: 'asc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            user: { select: { id: true, fullName: true, email: true } },
            department: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
            roles: { include: { role: { select: { key: true } } } },
            scopes: { include: { role: { select: { key: true, name: true } } } },
          },
        }),
        total: await tx.organizationMembership.count({ where }),
        cardCounts: await tx.card.groupBy({
          by: ['ownerUserId'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
      }),
    );

    const cardsByUser = new Map(cardCounts.map((row) => [row.ownerUserId, row._count._all]));
    const scopeNames = await this.scopeNames(tenant.organizationId, rows.flatMap((row) => row.scopes));

    return {
      data: rows.map((row) => ({
        membershipId: row.id,
        userId: row.user.id,
        fullName: row.user.fullName,
        email: row.user.email,
        status: row.revokedAt ? 'revoked' : row.status,
        roles: row.roles.map((link) => link.role.key),
        scopes: row.scopes.map(
          (scopeRow): MemberScope => ({
            id: scopeRow.id,
            roleKey: scopeRow.role.key,
            roleName: scopeRow.role.name,
            scopeType: scopeRow.scopeType as ScopeType,
            scopeId: scopeRow.scopeId,
            scopeName: scopeNames.get(scopeRow.scopeId) ?? '—',
          }),
        ),
        departmentId: row.department?.id ?? null,
        departmentName: row.department?.name ?? null,
        branchId: row.branch?.id ?? null,
        branchName: row.branch?.name ?? null,
        jobTitle: row.jobTitle,
        employeeNo: row.employeeNo,
        directoryVisible: row.directoryVisible,
        cardCount: cardsByUser.get(row.user.id) ?? 0,
        joinedAt: row.joinedAt?.toISOString() ?? null,
        offboardedAt: row.offboardedAt?.toISOString() ?? null,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /**
   * تعديل بيانات عضو ودوره.
   *
   * نقل العضو إلى إدارة **خارج** نطاق المُعدِّل ممنوع: مسؤول المبيعات
   * يستطيع تعديل موظفي إدارته، لا أن ينقلهم إلى إدارة أخرى — وهو ما
   * كان سيمنحه تعديل صفوف لا يملكها بخطوتين.
   */
  async update(
    tenant: TenantContext,
    actorUserId: string,
    membershipId: string,
    input: UpdateMemberInput,
  ): Promise<void> {
    const membership = await this.requireMembership(tenant.organizationId, membershipId);

    assertScopeCovers(tenant, 'members:manage', {
      departmentId: membership.departmentId,
      branchId: membership.branchId,
    });

    if (input.departmentId !== undefined || input.branchId !== undefined) {
      assertScopeCovers(tenant, 'members:manage', {
        departmentId: input.departmentId ?? membership.departmentId,
        branchId: input.branchId ?? membership.branchId,
      });
    }

    // المالك لا يُخفَّض من هنا: خفض المالك الوحيد يترك المؤسسة بلا من
    // يملك تغيير أي شيء فيها، ولا مسار إداري لاستعادتها.
    const isOwner = membership.roles.some((link) => link.role.key === SYSTEM_ROLES.OWNER);
    if (isOwner && input.role) {
      throw new ConflictException('دور المالك لا يُغيَّر من شاشة الأعضاء');
    }

    await withRlsContext(this.prisma, { organizationId: tenant.organizationId }, async (tx) => {
      await tx.organizationMembership.update({
        where: { id: membershipId },
        data: {
          ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
          ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
          ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
          ...(input.jobTitleEn !== undefined ? { jobTitleEn: input.jobTitleEn } : {}),
          ...(input.employeeNo !== undefined ? { employeeNo: input.employeeNo } : {}),
          ...(input.directoryVisible !== undefined
            ? { directoryVisible: input.directoryVisible }
            : {}),
        },
      });

      if (input.role) {
        await replaceOrgRole(tx, membershipId, input.role);
      }

      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId,
          action: 'member.updated',
          resourceType: 'membership',
          resourceId: membershipId,
          outcome: 'success',
          // لا اسم ولا بريد: أسماء الحقول المعدَّلة تكفي للتتبع (§9.4).
          metadata: { fields: Object.keys(input) },
        },
      });
    }).catch(rethrowDuplicateEmployeeNo);
  }

  /**
   * يمنح تفويضاً محدوداً على إدارة أو فرع.
   *
   * يشترط صلاحية الإدارة **على المؤسسة كلها**: تفويض محدود لا يورّث
   * نفسه، وإلا لصار بوسع مسؤول إدارة أن يصنع مسؤولين آخرين ويوسّع
   * دائرته بلا مرور على مالك المؤسسة.
   */
  async grantScope(
    tenant: TenantContext,
    actorUserId: string,
    membershipId: string,
    roleKey: string,
    scopeType: ScopeType,
    scopeId: string,
  ): Promise<void> {
    if (!tenant.permissions.includes('members:manage')) {
      throw new ConflictException('منح التفويض يتطلب صلاحية إدارة الأعضاء على المؤسسة');
    }

    await this.requireMembership(tenant.organizationId, membershipId);

    const role = await this.prisma.role.findFirst({
      where: { organizationId: null, key: roleKey },
    });

    if (!role) {
      throw new NotFoundException('الدور غير موجود');
    }

    await withRlsContext(this.prisma, { organizationId: tenant.organizationId }, async (tx) => {
      await tx.membershipScope.create({
        data: {
          organizationId: tenant.organizationId,
          membershipId,
          roleId: role.id,
          scopeType,
          scopeId,
          grantedByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId,
          action: 'member.scope_granted',
          resourceType: 'membership',
          resourceId: membershipId,
          outcome: 'success',
          metadata: { roleKey, scopeType, scopeId },
        },
      });
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('هذا التفويض ممنوح بالفعل');
      }
      throw error;
    });
  }

  async revokeScope(
    tenant: TenantContext,
    actorUserId: string,
    membershipId: string,
    scopeRowId: string,
  ): Promise<void> {
    if (!tenant.permissions.includes('members:manage')) {
      throw new ConflictException('سحب التفويض يتطلب صلاحية إدارة الأعضاء على المؤسسة');
    }

    await withRlsContext(this.prisma, { organizationId: tenant.organizationId }, async (tx) => {
      const deleted = await tx.membershipScope.deleteMany({
        where: { id: scopeRowId, membershipId },
      });

      if (deleted.count === 0) {
        throw new NotFoundException('التفويض غير موجود');
      }

      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId,
          action: 'member.scope_revoked',
          resourceType: 'membership',
          resourceId: membershipId,
          outcome: 'success',
          metadata: { scopeRowId },
        },
      });
    });
  }

  /**
   * إنهاء خدمة موظف (§9.2).
   *
   * أربعة آثار في معاملة واحدة: إلغاء العضوية، إلغاء نشر بطاقاته، نقل
   * ملكية بياناته التجارية، وتسجيل الحدث. تنفيذها متفرقة كان يعني حالة
   * وسيطة يبقى فيها الموظف بلا وصول وبطاقته المنشورة تحمل اسم المؤسسة.
   *
   * **البطاقة تُلغى نشرها ولا تُحذف.** الرابط لا يُعاد استخدامه أبداً
   * (القاعدة 13)، فالحذف لا يحرّر شيئاً ويفقد سجلاً قد يُحتاج.
   */
  async offboard(
    tenant: TenantContext,
    actorUserId: string,
    membershipId: string,
    input: OffboardMemberInput,
  ): Promise<void> {
    const membership = await this.requireMembership(tenant.organizationId, membershipId);

    assertScopeCovers(tenant, 'members:manage', {
      departmentId: membership.departmentId,
      branchId: membership.branchId,
    });

    if (membership.roles.some((link) => link.role.key === SYSTEM_ROLES.OWNER)) {
      throw new ConflictException('لا يمكن إنهاء خدمة مالك المؤسسة');
    }

    if (membership.userId === actorUserId) {
      throw new ConflictException('لا يمكنك إنهاء خدمة نفسك');
    }

    if (input.transferToUserId) {
      const target = await withRlsContext(
        this.prisma,
        { organizationId: tenant.organizationId },
        (tx) =>
          tx.organizationMembership.findFirst({
            where: { userId: input.transferToUserId as string, status: 'active', revokedAt: null },
            select: { id: true },
          }),
      );

      if (!target) {
        throw new BadRequestException('المستلم ليس عضواً نشطاً في المؤسسة');
      }
    }

    const effectiveAt = input.effectiveAt ?? new Date();

    await withRlsContext(this.prisma, { organizationId: tenant.organizationId }, async (tx) => {
      await tx.organizationMembership.update({
        where: { id: membershipId },
        data: {
          status: 'revoked',
          revokedAt: effectiveAt,
          offboardedAt: effectiveAt,
          directoryVisible: false,
        },
      });

      // التفويضات المحدودة تسقط مع العضوية: تركها يمنح صلاحية إدارة
      // لمن لم يعد موظفاً لو أُعيدت عضويته لاحقاً.
      await tx.membershipScope.deleteMany({ where: { membershipId } });

      if (input.unpublishCards) {
        await tx.card.updateMany({
          where: { ownerUserId: membership.userId, status: 'published' },
          data: { status: 'unpublished', publishedAt: null },
        });
      }

      if (input.transferToUserId) {
        await tx.card.updateMany({
          where: { ownerUserId: membership.userId, deletedAt: null },
          data: { ownerUserId: input.transferToUserId },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId,
          action: 'member.offboarded',
          resourceType: 'membership',
          resourceId: membershipId,
          outcome: 'success',
          metadata: {
            unpublishCards: input.unpublishCards,
            transferred: Boolean(input.transferToUserId),
            reason: input.reason ?? null,
          },
        },
      });

      await tx.outboxEvent.createMany({
        data: [
          {
            organizationId: tenant.organizationId,
            eventType: OUTBOX_EVENT_TYPES.MEMBERSHIP_REVOKED,
            payload: { membershipId, userId: membership.userId },
          },
          {
            organizationId: tenant.organizationId,
            eventType: OUTBOX_EVENT_TYPES.MEMBER_OFFBOARDED,
            payload: { membershipId, userId: membership.userId },
          },
        ],
      });
    });

    this.logger.log(`أُنهيت خدمة العضوية ${membershipId} في ${tenant.organizationId}`);
  }

  /** يعيد تفعيل عضوية أُلغيت — عودة موظف أو تصحيح خطأ. */
  async reinstate(
    tenant: TenantContext,
    actorUserId: string,
    membershipId: string,
  ): Promise<void> {
    const membership = await this.requireMembership(tenant.organizationId, membershipId);

    assertScopeCovers(tenant, 'members:manage', {
      departmentId: membership.departmentId,
      branchId: membership.branchId,
    });

    await withRlsContext(this.prisma, { organizationId: tenant.organizationId }, async (tx) => {
      await tx.organizationMembership.update({
        where: { id: membershipId },
        data: {
          status: 'active',
          revokedAt: null,
          offboardedAt: null,
          directoryVisible: true,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId,
          action: 'member.reinstated',
          resourceType: 'membership',
          resourceId: membershipId,
          outcome: 'success',
        },
      });
    });
  }

  private async requireMembership(organizationId: string, membershipId: string) {
    const membership = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.organizationMembership.findFirst({
        where: { id: membershipId },
        include: { roles: { include: { role: { select: { key: true } } } } },
      }),
    );

    if (!membership) {
      throw new NotFoundException('العضوية غير موجودة');
    }

    return membership;
  }

  /** أسماء الوحدات المشار إليها في التفويضات — لعرضها بدل معرّفاتها. */
  private async scopeNames(
    organizationId: string,
    scopes: Array<{ scopeType: string; scopeId: string }>,
  ): Promise<Map<string, string>> {
    if (scopes.length === 0) {
      return new Map();
    }

    const departmentIds = scopes.filter((s) => s.scopeType === 'department').map((s) => s.scopeId);
    const branchIds = scopes.filter((s) => s.scopeType === 'branch').map((s) => s.scopeId);

    const { departments, branches } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => ({
        departments: await tx.department.findMany({
          where: { id: { in: departmentIds } },
          select: { id: true, name: true },
        }),
        branches: await tx.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true },
        }),
      }),
    );

    return new Map([...departments, ...branches].map((entry) => [entry.id, entry.name]));
  }
}

/**
 * يستبدل الدور على المؤسسة.
 *
 * حذف ثم إضافة داخل المعاملة نفسها: عضو بدورين متناقضين حالة لا نريد
 * أن يمر بها النظام ولو للحظة، لأن حارس الصلاحيات يجمع صلاحيات كل
 * الأدوار — فلحظةٌ بدورين تعني صلاحيات أوسع من المقصود.
 *
 * أدوار التفويض المحدود لا تمر من هنا إطلاقاً: مكانها membership_scopes.
 */
async function replaceOrgRole(
  tx: TenantScopedClient,
  membershipId: string,
  roleKey: string,
): Promise<void> {
  const role = await tx.role.findFirst({ where: { organizationId: null, key: roleKey } });

  if (!role) {
    throw new NotFoundException('الدور غير موجود');
  }

  await tx.membershipRole.deleteMany({ where: { membershipId } });
  await tx.membershipRole.create({ data: { membershipId, roleId: role.id } });
}

function rethrowDuplicateEmployeeNo(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('الرقم الوظيفي مستخدم لعضو آخر');
  }
  throw error;
}
