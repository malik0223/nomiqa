import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { ORGANIZATION_HEADER, TenantContextGuard } from '../../src/tenancy/tenant-context.guard.js';
import { withRlsContext } from '@nomiqa/database';
import { admin, app, createTenant, disconnectAll, ensureSystemRole, resetData } from './helpers.js';

/**
 * اختبارات الحارس مقابل قاعدة بيانات حقيقية بالدور المقيّد.
 *
 * الاختبارات السابقة تغطي طبقة قاعدة البيانات. هذه تغطي الطبقتين
 * الأولى والثانية: سياق الطلب والتحقق من العضوية — وتحديداً أن
 * الحارس يعمل فعلاً عندما لا يكون التطبيق superuser.
 */
describe('TenantContextGuard مقابل قاعدة بيانات حقيقية', () => {
  let guard: TenantContextGuard;
  let ownerRoleId: string;

  function contextFor(userId: string, organizationId: string | undefined): ExecutionContext {
    const request = {
      user: {
        id: userId,
        auth0UserId: 'auth0|x',
        email: 'x@test.local',
        emailVerified: true,
        fullName: null,
      },
      tenant: undefined as unknown,
      header: (name: string) =>
        name.toLowerCase() === ORGANIZATION_HEADER ? organizationId : undefined,
    };

    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => vi.fn(),
      getClass: () => vi.fn(),
    } as unknown as ExecutionContext;
  }

  function requestOf(context: ExecutionContext) {
    return context
      .switchToHttp()
      .getRequest<{ tenant?: { roles: string[]; permissions: string[] } }>();
  }

  beforeAll(async () => {
    const reflector = new Reflector();
    // لا @Public ولا @NoTenantRequired على المسار
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    // الحارس يستقبل PrismaService؛ العميل المقيّد متوافق معه بنيوياً
    // وهو المقصود: نريد اختباره في ظروف الإنتاج لا كـsuperuser.
    guard = new TenantContextGuard(reflector, app as unknown as PrismaService);

    ownerRoleId = await ensureSystemRole('owner', ['cards:read', 'cards:write', 'cards:publish']);
  });

  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  beforeEach(async () => {
    await resetData();
    ownerRoleId = await ensureSystemRole('owner', ['cards:read', 'cards:write', 'cards:publish']);
  });

  it('يسمح لعضو نشط ويملأ سياق المؤسسة بأدواره وصلاحياته', async () => {
    const tenant = await createTenant('active', { roleId: ownerRoleId });
    const context = contextFor(tenant.userId, tenant.organizationId);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const request = requestOf(context);
    expect(request.tenant?.roles).toContain('owner');
    expect(request.tenant?.permissions).toEqual(
      expect.arrayContaining(['cards:read', 'cards:write', 'cards:publish']),
    );
  });

  it('يرفض عند غياب ترويسة المؤسسة', async () => {
    const tenant = await createTenant('no-header', { roleId: ownerRoleId });

    await expect(guard.canActivate(contextFor(tenant.userId, undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('يرفض مستخدم مؤسسة أ عند طلب مؤسسة ب', async () => {
    const tenantA = await createTenant('cross-a', { roleId: ownerRoleId });
    const tenantB = await createTenant('cross-b', { roleId: ownerRoleId });

    await expect(
      guard.canActivate(contextFor(tenantA.userId, tenantB.organizationId)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('يرفض فور تعطيل العضوية دون انتظار انتهاء الرمز', async () => {
    const tenant = await createTenant('revoked', { roleId: ownerRoleId, revoked: true });

    await expect(
      guard.canActivate(contextFor(tenant.userId, tenant.organizationId)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('يرفض العضوية غير النشطة', async () => {
    const tenant = await createTenant('inactive', { roleId: ownerRoleId, status: 'suspended' });

    await expect(
      guard.canActivate(contextFor(tenant.userId, tenant.organizationId)),
    ).rejects.toThrow(ForbiddenException);
  });

  describe('قراءة عضويات المستخدم عبر المؤسسات (مسار /me)', () => {
    it('يرى المستخدم عضوياته في كل مؤسساته بسياق المستخدم وحده', async () => {
      const first = await createTenant('multi-1', { roleId: ownerRoleId });

      // المستخدم نفسه عضو في مؤسسة ثانية
      const second = await admin.organization.create({
        data: { slug: `org-multi-2-${Date.now()}`, name: 'مؤسسة ثانية', kind: 'business' },
      });
      await admin.organizationMembership.create({
        data: {
          organizationId: second.id,
          userId: first.userId,
          status: 'active',
          joinedAt: new Date(),
          roles: { create: { roleId: ownerRoleId } },
        },
      });

      // مؤسسة لمستخدم آخر — يجب ألا تظهر
      await createTenant('multi-other', { roleId: ownerRoleId });

      const memberships = await withRlsContext(app, { userId: first.userId }, (tx) =>
        tx.organizationMembership.findMany({ include: { organization: true } }),
      );

      expect(memberships).toHaveLength(2);
      expect(memberships.map((m) => m.organizationId).sort()).toEqual(
        [first.organizationId, second.id].sort(),
      );
    });

    it('لا يرى المستخدم عضويات مستخدم آخر', async () => {
      const mine = await createTenant('self', { roleId: ownerRoleId });
      await createTenant('other', { roleId: ownerRoleId });

      const memberships = await withRlsContext(app, { userId: mine.userId }, (tx) =>
        tx.organizationMembership.findMany(),
      );

      expect(memberships).toHaveLength(1);
      expect(memberships[0]?.userId).toBe(mine.userId);
    });

    it('سياق المستخدم لا يمنح قدرة على الكتابة', async () => {
      const mine = await createTenant('write-probe', { roleId: ownerRoleId });

      // السياسة الذاتية مقصورة على SELECT عمداً.
      await expect(
        withRlsContext(app, { userId: mine.userId }, (tx) =>
          tx.organizationMembership.update({
            where: { id: mine.membershipId },
            data: { status: 'owner-escalation' },
          }),
        ),
      ).rejects.toThrow();
    });
  });

  it('لا تكشف رسالة الرفض وجود مؤسسة بمعرّف معيّن', async () => {
    const tenantA = await createTenant('probe-a', { roleId: ownerRoleId });
    const tenantB = await createTenant('probe-b', { roleId: ownerRoleId });

    const missingOrg = await guard
      .canActivate(contextFor(tenantA.userId, '00000000-0000-4000-8000-000000000000'))
      .catch((error: Error) => error.message);

    const existingOrg = await guard
      .canActivate(contextFor(tenantA.userId, tenantB.organizationId))
      .catch((error: Error) => error.message);

    // نفس الرسالة للحالتين، وإلا صارت الاستجابة أداة استكشاف.
    expect(missingOrg).toBe(existingOrg);
  });
});
