import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BranchSummary, DepartmentNode } from '@nomiqa/contracts';
import { Prisma, withRlsContext } from '@nomiqa/database';
import type {
  createBranchSchema,
  createDepartmentSchema,
  updateBranchSchema,
  updateDepartmentSchema,
} from '@nomiqa/validation';
import type { z } from 'zod';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type DepartmentInput = z.infer<typeof createDepartmentSchema>;
type DepartmentPatch = z.infer<typeof updateDepartmentSchema>;
type BranchInput = z.infer<typeof createBranchSchema>;
type BranchPatch = z.infer<typeof updateBranchSchema>;

/**
 * الإدارات والفروع (خارطة الطريق §9.2).
 *
 * الحذف لا يحذف الموظفين: مفتاح `department_id` على العضوية بـ
 * `SET NULL`، فحذف إدارة يترك أعضاءها بلا إدارة لا بلا عضوية. إدارة
 * تُلغى في إعادة هيكلة حدث يومي، وفقدان مئة موظف بسببه ليس كذلك.
 */
@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  // ---------------------------------------------------------------
  // الإدارات
  // ---------------------------------------------------------------

  /**
   * شجرة الإدارات مع أعداد الأعضاء.
   *
   * تُبنى في الذاكرة من قائمة مسطّحة: استعلام تعاودي في SQL كان أسرع
   * نظرياً، لكن عدد الإدارات في مؤسسة واحدة عشرات لا آلاف، وشجرة
   * مبنية هنا تُختبر ولا تحتاج امتداداً في قاعدة البيانات.
   */
  async listDepartments(organizationId: string): Promise<DepartmentNode[]> {
    const { departments, counts } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => ({
        departments: await tx.department.findMany({ orderBy: { name: 'asc' } }),
        counts: await tx.organizationMembership.groupBy({
          by: ['departmentId'],
          where: { status: 'active', revokedAt: null },
          _count: { _all: true },
        }),
      }),
    );

    const countById = new Map(
      counts.map((row) => [row.departmentId ?? '', row._count._all]),
    );

    const nodes = new Map<string, DepartmentNode>(
      departments.map((department) => [
        department.id,
        {
          id: department.id,
          parentId: department.parentId,
          name: department.name,
          nameEn: department.nameEn,
          code: department.code,
          memberCount: countById.get(department.id) ?? 0,
          children: [],
        },
      ]),
    );

    const roots: DepartmentNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async createDepartment(organizationId: string, input: DepartmentInput): Promise<DepartmentNode> {
    await this.assertQuota(organizationId, 'maxDepartments', 'إدارة');

    if (input.parentId) {
      await this.requireDepartment(organizationId, input.parentId);
    }

    const created = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.department.create({
        data: {
          organizationId,
          name: input.name,
          nameEn: input.nameEn ?? null,
          code: input.code ?? null,
          parentId: input.parentId ?? null,
        },
      }),
    ).catch(rethrowDuplicateCode('إدارة'));

    return {
      id: created.id,
      parentId: created.parentId,
      name: created.name,
      nameEn: created.nameEn,
      code: created.code,
      memberCount: 0,
      children: [],
    };
  }

  /**
   * تعديل إدارة.
   *
   * يرفض جعل الإدارة تابعةً لنفسها أو لأحد فروعها: دورة في الشجرة
   * تجعل بناءها حلقة لا نهائية، والقيد الوحيد في قاعدة البيانات
   * (مفتاح أجنبي على النفس) لا يمنعها.
   */
  async updateDepartment(
    organizationId: string,
    departmentId: string,
    input: DepartmentPatch,
  ): Promise<void> {
    await this.requireDepartment(organizationId, departmentId);

    if (input.parentId) {
      if (input.parentId === departmentId) {
        throw new BadRequestException('لا يمكن أن تتبع الإدارة نفسها');
      }
      if (await this.isDescendant(organizationId, departmentId, input.parentId)) {
        throw new BadRequestException('لا يمكن أن تتبع الإدارة إحدى الإدارات التابعة لها');
      }
    }

    await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.department.update({
        where: { id: departmentId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        },
      }),
    ).catch(rethrowDuplicateCode('إدارة'));
  }

  async deleteDepartment(organizationId: string, departmentId: string): Promise<void> {
    await this.requireDepartment(organizationId, departmentId);

    await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.department.delete({ where: { id: departmentId } }),
    );
  }

  // ---------------------------------------------------------------
  // الفروع
  // ---------------------------------------------------------------

  async listBranches(organizationId: string): Promise<BranchSummary[]> {
    const { branches, counts } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => ({
        branches: await tx.branch.findMany({ orderBy: { name: 'asc' } }),
        counts: await tx.organizationMembership.groupBy({
          by: ['branchId'],
          where: { status: 'active', revokedAt: null },
          _count: { _all: true },
        }),
      }),
    );

    const countById = new Map(counts.map((row) => [row.branchId ?? '', row._count._all]));

    return branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      nameEn: branch.nameEn,
      code: branch.code,
      city: branch.city,
      country: branch.country,
      addressLine: branch.addressLine,
      phone: branch.phone,
      memberCount: countById.get(branch.id) ?? 0,
    }));
  }

  async createBranch(organizationId: string, input: BranchInput): Promise<BranchSummary> {
    await this.assertQuota(organizationId, 'maxBranches', 'فرع');

    const created = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.branch.create({
        data: {
          organizationId,
          name: input.name,
          nameEn: input.nameEn ?? null,
          code: input.code ?? null,
          city: input.city ?? null,
          country: input.country ?? 'OM',
          addressLine: input.addressLine ?? null,
          phone: input.phone ?? null,
        },
      }),
    ).catch(rethrowDuplicateCode('فرع'));

    return {
      id: created.id,
      name: created.name,
      nameEn: created.nameEn,
      code: created.code,
      city: created.city,
      country: created.country,
      addressLine: created.addressLine,
      phone: created.phone,
      memberCount: 0,
    };
  }

  async updateBranch(
    organizationId: string,
    branchId: string,
    input: BranchPatch,
  ): Promise<void> {
    await this.requireBranch(organizationId, branchId);

    await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.branch.update({
        where: { id: branchId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.country !== undefined ? { country: input.country } : {}),
          ...(input.addressLine !== undefined ? { addressLine: input.addressLine } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
        },
      }),
    ).catch(rethrowDuplicateCode('فرع'));
  }

  async deleteBranch(organizationId: string, branchId: string): Promise<void> {
    await this.requireBranch(organizationId, branchId);

    await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.branch.delete({ where: { id: branchId } }),
    );
  }

  // ---------------------------------------------------------------
  // مساعدات مشتركة
  // ---------------------------------------------------------------

  /** يترجم رموز الوحدات إلى معرّفات — يستخدمه الاستيراد الجماعي. */
  async codeMaps(
    organizationId: string,
  ): Promise<{ departments: Map<string, string>; branches: Map<string, string> }> {
    const { departments, branches } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => ({
        departments: await tx.department.findMany({ select: { id: true, code: true } }),
        branches: await tx.branch.findMany({ select: { id: true, code: true } }),
      }),
    );

    return {
      departments: new Map(
        departments.filter((entry) => entry.code).map((entry) => [entry.code as string, entry.id]),
      ),
      branches: new Map(
        branches.filter((entry) => entry.code).map((entry) => [entry.code as string, entry.id]),
      ),
    };
  }

  async requireDepartment(organizationId: string, departmentId: string): Promise<void> {
    const exists = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.department.findFirst({ where: { id: departmentId }, select: { id: true } }),
    );

    if (!exists) {
      throw new NotFoundException('الإدارة غير موجودة');
    }
  }

  async requireBranch(organizationId: string, branchId: string): Promise<void> {
    const exists = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.branch.findFirst({ where: { id: branchId }, select: { id: true } }),
    );

    if (!exists) {
      throw new NotFoundException('الفرع غير موجود');
    }
  }

  private async isDescendant(
    organizationId: string,
    ancestorId: string,
    candidateId: string,
  ): Promise<boolean> {
    const departments = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.department.findMany({ select: { id: true, parentId: true } }),
    );

    const parentById = new Map(departments.map((entry) => [entry.id, entry.parentId]));

    let cursor: string | null | undefined = candidateId;
    // حدّ الدورات = عدد الإدارات: شجرة سليمة لا تتجاوزه، وشجرة تالفة
    // (دورة موجودة سلفاً) تخرج بدل أن تدور بلا نهاية.
    for (let step = 0; step < departments.length && cursor; step += 1) {
      if (cursor === ancestorId) {
        return true;
      }
      cursor = parentById.get(cursor) ?? null;
    }

    return false;
  }

  private async assertQuota(
    organizationId: string,
    resource: 'maxDepartments' | 'maxBranches',
    label: string,
  ): Promise<void> {
    const quota = await this.entitlements.quota(organizationId, resource);

    if (!quota.canAdd) {
      throw new ForbiddenException(
        quota.limit === 0
          ? `باقتك الحالية لا تدعم إنشاء ${label}. رقِّ الباقة لتفعيل الهيكل التنظيمي.`
          : `بلغت حد الباقة: ${quota.limit} ${label}.`,
      );
    }
  }
}

/**
 * يحوّل تعارض الرمز إلى رسالة مفهومة.
 *
 * `P2002` على `(organization_id, code)` يعني أن الرمز مستخدم. رسالة
 * Prisma الخام تذكر أسماء أعمدة قاعدة البيانات، وهي بلا معنى لمسؤول
 * موارد بشرية يقرأها في الواجهة.
 */
function rethrowDuplicateCode(label: string) {
  return (error: unknown): never => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`رمز ${label} مستخدم بالفعل`);
    }
    throw error;
  };
}
