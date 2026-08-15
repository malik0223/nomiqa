import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { PlatformAdminGuard } from '../../src/admin/platform-admin.guard.js';
import { admin, app, createTenant, disconnectAll, resetData } from './helpers.js';

function contextFor(userId: string | undefined): ExecutionContext {
  const request = userId
    ? { user: { id: userId }, requestId: 'test-request' }
    : { requestId: 'test-request' };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

describe('إدارة المنصة', () => {
  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  beforeEach(async () => {
    await resetData();
  });

  describe('PlatformAdminGuard', () => {
    it('يرفض مستخدماً عادياً', async () => {
      const tenant = await createTenant('not-admin');
      const guard = new PlatformAdminGuard(app as unknown as PrismaService);

      await expect(guard.canActivate(contextFor(tenant.userId))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('يرفض طلباً بلا مستخدم', async () => {
      const guard = new PlatformAdminGuard(app as unknown as PrismaService);

      await expect(guard.canActivate(contextFor(undefined))).rejects.toThrow(ForbiddenException);
    });

    it('يسمح لمسؤول المنصة', async () => {
      const tenant = await createTenant('is-admin');
      await admin.platformAdmin.create({ data: { userId: tenant.userId } });

      const guard = new PlatformAdminGuard(app as unknown as PrismaService);
      await expect(guard.canActivate(contextFor(tenant.userId))).resolves.toBe(true);
    });

    it('يرفض فور سحب الصلاحية دون انتظار انتهاء الرمز', async () => {
      const tenant = await createTenant('revoked-admin');
      await admin.platformAdmin.create({
        data: { userId: tenant.userId, revokedAt: new Date() },
      });

      const guard = new PlatformAdminGuard(app as unknown as PrismaService);
      await expect(guard.canActivate(contextFor(tenant.userId))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('إحصاءات الإدارة لا تكشف صفوف المؤسسات', () => {
    it('تُرجع أعداداً صحيحة دون سياق مؤسسة', async () => {
      const first = await createTenant('stats-a');
      await createTenant('stats-b');

      // بدور مقيّد وبلا أي سياق — الحالة التي يعمل بها التطبيق.
      const rows = await app.$queryRaw<
        Array<{ organization_id: string; member_count: bigint }>
      >`SELECT * FROM admin_organization_stats()`;

      expect(rows.length).toBe(2);
      const forFirst = rows.find((row) => row.organization_id === first.organizationId);
      expect(Number(forFirst?.member_count)).toBe(1);
    });

    it('الصفوف نفسها تبقى محجوبة رغم توفر الأعداد', async () => {
      await createTenant('stats-hidden');

      // الدالة أعطت العدد، لكن القراءة المباشرة ما زالت ممنوعة.
      const stats = await app.$queryRaw<Array<{ member_count: bigint }>>`
        SELECT * FROM admin_organization_stats()
      `;
      expect(Number(stats[0]?.member_count)).toBe(1);

      const rows = await app.organizationMembership.count();
      expect(rows).toBe(0);
    });

    it('الإجماليات تعمل بلا سياق', async () => {
      await createTenant('totals-a');
      await createTenant('totals-b');

      const [totals] = await app.$queryRaw<
        Array<{ total_users: bigint; total_organizations: bigint }>
      >`SELECT * FROM admin_platform_totals()`;

      expect(Number(totals?.total_users)).toBe(2);
      expect(Number(totals?.total_organizations)).toBe(2);
    });
  });

  describe('سجل تدقيق الإدارة', () => {
    it('يُكتب ويُقرأ بلا سياق مؤسسة', async () => {
      const tenant = await createTenant('audit-admin');

      await app.platformAuditLog.create({
        data: {
          actorUserId: tenant.userId,
          action: 'feature_flag.updated',
          resourceType: 'feature_flag',
          resourceId: 'card_editor',
        },
      });

      const entries = await app.platformAuditLog.findMany();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.action).toBe('feature_flag.updated');
    });
  });
});
