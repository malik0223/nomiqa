import { ForbiddenException, Injectable } from '@nestjs/common';
import type { DirectoryEntry, Paginated } from '@nomiqa/contracts';
import { Prisma, withRlsContext } from '@nomiqa/database';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * دليل الموظفين (خارطة الطريق §9.2).
 *
 * ما يُعرض هنا **أقل** مما تعرفه المؤسسة عن موظفها عمداً: اسم ومسمى
 * ووحدة ورابط بطاقة منشورة. لا بريد ولا هاتف ولا رقم وظيفي — من أراد
 * بيانات الاتصال يفتح البطاقة، وهي المكان الذي قرر صاحبها ما يظهر فيه.
 *
 * الدليل متاح لكل عضو بصلاحية `directory:read` بلا تفويض إضافي: هذا
 * دليل داخلي، وقصره على الإدارة يفقده غرضه.
 */
@Injectable()
export class DirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async search(
    organizationId: string,
    query: {
      q?: string;
      departmentId?: string;
      branchId?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<Paginated<DirectoryEntry>> {
    if (!(await this.entitlements.hasFeature(organizationId, 'employee_directory'))) {
      throw new ForbiddenException('دليل الموظفين متاح في باقة الفرق والشركات وما فوقها');
    }

    const where: Prisma.OrganizationMembershipWhereInput = {
      status: 'active',
      revokedAt: null,
      // الإخفاء قرار يُحترم بلا استثناء: لا معامل استعلام يتجاوزه.
      directoryVisible: true,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.q
        ? {
            OR: [
              { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
              { jobTitle: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const { rows, total, cards } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => {
        const found = await tx.organizationMembership.findMany({
          where,
          orderBy: [{ department: { name: 'asc' } }, { user: { fullName: 'asc' } }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            user: { select: { id: true, fullName: true, avatarUrl: true } },
            department: { select: { name: true } },
            branch: { select: { name: true } },
          },
        });

        return {
          rows: found,
          total: await tx.organizationMembership.count({ where }),
          // بطاقة منشورة واحدة لكل موظف تكفي للدليل: من له عدة بطاقات
          // تُعرض أحدثها نشراً، لا قائمة تُربك القارئ.
          cards: await tx.card.findMany({
            where: {
              ownerUserId: { in: found.map((row) => row.userId) },
              status: 'published',
              deletedAt: null,
            },
            orderBy: { publishedAt: 'desc' },
            select: { ownerUserId: true, slug: true },
          }),
        };
      },
    );

    const slugByUser = new Map<string, string>();
    for (const card of cards) {
      if (!slugByUser.has(card.ownerUserId)) {
        slugByUser.set(card.ownerUserId, card.slug);
      }
    }

    return {
      data: rows.map((row) => ({
        membershipId: row.id,
        userId: row.user.id,
        fullName: row.user.fullName,
        jobTitle: row.jobTitle,
        departmentName: row.department?.name ?? null,
        branchName: row.branch?.name ?? null,
        cardSlug: slugByUser.get(row.userId) ?? null,
        avatarUrl: row.user.avatarUrl,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
