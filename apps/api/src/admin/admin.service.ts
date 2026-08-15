import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

interface AuditInput {
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: unknown;
  requestId?: string;
  ipAddress?: string;
}

interface OrganizationStatRow {
  organization_id: string;
  member_count: bigint;
  file_count: bigint;
}

interface PlatformTotalsRow {
  total_users: bigint;
  total_organizations: bigint;
  total_active_memberships: bigint;
  total_files: bigint;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * إجماليات المنصة.
   *
   * تعتمد على دالة SECURITY DEFINER تُرجع أرقاماً فقط — فلا يحتاج
   * التطبيق تجاوز RLS ولا امتيازاً إضافياً على الجداول.
   */
  async platformTotals() {
    const [row] = await this.prisma.$queryRaw<PlatformTotalsRow[]>`
      SELECT * FROM admin_platform_totals()
    `;

    return {
      users: Number(row?.total_users ?? 0),
      organizations: Number(row?.total_organizations ?? 0),
      activeMemberships: Number(row?.total_active_memberships ?? 0),
      files: Number(row?.total_files ?? 0),
    };
  }

  /**
   * قائمة المؤسسات ببيانات وصفية وأعداد.
   *
   * لا أسماء أعضاء ولا بريدهم ولا أي محتوى — جدول organizations
   * ليس عليه RLS لأنه لا يحمل بيانات شخصية، والأعداد تأتي من الدالة
   * المجمّعة.
   */
  async listOrganizations(page: number, pageSize: number) {
    const [organizations, total, stats] = await Promise.all([
      this.prisma.organization.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          slug: true,
          name: true,
          kind: true,
          defaultLocale: true,
          createdAt: true,
        },
      }),
      this.prisma.organization.count({ where: { deletedAt: null } }),
      this.prisma.$queryRaw<OrganizationStatRow[]>`SELECT * FROM admin_organization_stats()`,
    ]);

    const statsById = new Map(
      stats.map((row) => [
        row.organization_id,
        { memberCount: Number(row.member_count), fileCount: Number(row.file_count) },
      ]),
    );

    return {
      data: organizations.map((organization) => ({
        ...organization,
        createdAt: organization.createdAt.toISOString(),
        memberCount: statsById.get(organization.id)?.memberCount ?? 0,
        fileCount: statsById.get(organization.id)?.fileCount ?? 0,
      })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async listAudit(page: number, pageSize: number) {
    const [entries, total] = await Promise.all([
      this.prisma.platformAuditLog.findMany({
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.platformAuditLog.count(),
    ]);

    return {
      data: entries.map((entry) => ({
        ...entry,
        occurredAt: entry.occurredAt.toISOString(),
      })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /**
   * يسجّل عملية إدارية.
   *
   * كل عملية تغيير من اللوحة تمر من هنا. صلاحية تتجاوز حدود
   * المؤسسات بلا سجل هي صلاحية بلا مساءلة.
   */
  async audit(actorUserId: string, input: AuditInput): Promise<void> {
    await this.prisma.platformAuditLog.create({
      data: {
        actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: input.metadata as never,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
      },
    });

    this.logger.log(`عملية إدارية: ${input.action} على ${input.resourceType}`);
  }
}
