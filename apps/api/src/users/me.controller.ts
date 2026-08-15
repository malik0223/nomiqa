import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, MeResponse, MyOrganization } from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CurrentUser } from '../tenancy/current.decorators.js';
import { NoTenantRequired } from '../tenancy/no-tenant.decorator.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /**
   * مسار الإقلاع الذي يستدعيه الويب بعد الدخول.
   *
   * لا يتطلب ترويسة مؤسسة لأنه هو نفسه من يخبر العميل بمؤسساته.
   */
  @NoTenantRequired()
  @Get()
  @ApiOperation({ summary: 'المستخدم الحالي ومؤسساته' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    // استعلام مقيّد بالمستخدم لا بالمؤسسة — يشمل كل مؤسساته.
    // سياق المستخدم وحده يكفي: سياسة memberships_self_read تكشف
    // صفوفه فقط، ولا سياق مؤسسة هنا لأن المسار سابق لاختيارها.
    const memberships = await withRlsContext(this.prisma, { userId: user.id }, (tx) =>
      tx.organizationMembership.findMany({
        where: {
          userId: user.id,
          status: 'active',
          revokedAt: null,
          organization: { deletedAt: null },
        },
        include: {
          organization: true,
          roles: {
            include: {
              role: { include: { permissions: { include: { permission: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );

    const organizations: MyOrganization[] = memberships.map((membership) => ({
      id: membership.organization.id,
      slug: membership.organization.slug,
      name: membership.organization.name,
      kind: membership.organization.kind,
      defaultLocale: membership.organization.defaultLocale,
      roles: membership.roles.map((link) => link.role.key),
      permissions: [
        ...new Set(
          membership.roles.flatMap((link) =>
            link.role.permissions.map((rolePermission) => rolePermission.permission.key),
          ),
        ),
      ],
    }));

    // الرايات تُقيَّم للمؤسسة الأولى: العميل يحتاجها فور الإقلاع
    // ليقرر ما يعرضه، وطلب منفصل لها يعني وميض واجهة عند كل تحميل.
    const featureFlags = await this.flags.evaluateAll(organizations[0]?.id ?? null);

    return { user, organizations, featureFlags };
  }
}
