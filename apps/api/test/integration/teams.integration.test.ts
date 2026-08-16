import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  admin,
  app,
  asOrganization,
  createTenant,
  disconnectAll,
  ensureSystemRole,
  resetData,
} from './helpers.js';

/**
 * عزل جداول المرحلة الرابعة (§9.2 و§9.3).
 *
 * الدعوات أخطر ما هنا: صف الدعوة يحمل بريد شخص وقراره بالانضمام إلى
 * جهة عمل بعينها، فتسريبه بين مؤسستين يكشف «فلان يوظَّف عند فلان»
 * قبل أن يعلن هو ذلك.
 *
 * `membership_scopes` يليه خطورةً رغم أنه جدول صلاحيات لا بيانات:
 * صفٌّ مزروع فيه من مؤسسة أخرى يمنح تفويضاً إدارياً — أثره أكبر من
 * قراءة بيانات.
 */
describe('عزل الفرق والهيكل التنظيمي', () => {
  let orgA: Awaited<ReturnType<typeof createTenant>>;
  let orgB: Awaited<ReturnType<typeof createTenant>>;
  let memberRoleId: string;
  let departmentA: string;
  let branchA: string;
  let invitationA: string;

  beforeAll(async () => {
    await resetData();
    memberRoleId = await ensureSystemRole('member', ['cards:read']);
  });

  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  beforeEach(async () => {
    await resetData();
    memberRoleId = await ensureSystemRole('member', ['cards:read']);

    orgA = await createTenant('teams-a', { roleId: memberRoleId });
    orgB = await createTenant('teams-b', { roleId: memberRoleId });

    const department = await admin.department.create({
      data: { organizationId: orgA.organizationId, name: 'المبيعات', code: 'SALES' },
    });
    departmentA = department.id;

    const branch = await admin.branch.create({
      data: { organizationId: orgA.organizationId, name: 'فرع صحار', code: 'SOHAR' },
    });
    branchA = branch.id;

    const invitation = await admin.invitation.create({
      data: {
        organizationId: orgA.organizationId,
        email: 'candidate@example.com',
        emailNormalized: 'candidate@example.com',
        tokenHash: `hash-${Date.now()}`,
        roleId: memberRoleId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    invitationA = invitation.id;
  });

  it('لا ترى المؤسسة إدارات غيرها ولا فروعهم', async () => {
    const seen = await asOrganization(orgB.organizationId, async (tx) => ({
      departments: await tx.department.findMany(),
      branches: await tx.branch.findMany(),
    }));

    expect(seen.departments).toHaveLength(0);
    expect(seen.branches).toHaveLength(0);
  });

  it('تقرأ المؤسسة وحداتها هي', async () => {
    const seen = await asOrganization(orgA.organizationId, (tx) => tx.department.findMany());

    expect(seen).toHaveLength(1);
    expect(seen[0]?.id).toBe(departmentA);
  });

  it('لا تقرأ المؤسسة دعوات غيرها', async () => {
    const seen = await asOrganization(orgB.organizationId, (tx) => tx.invitation.findMany());
    expect(seen).toHaveLength(0);
  });

  it('لا تعدّل المؤسسة دعوة غيرها ولو عرفت معرّفها', async () => {
    const updated = await asOrganization(orgB.organizationId, (tx) =>
      tx.invitation.updateMany({
        where: { id: invitationA },
        data: { status: 'revoked' },
      }),
    );

    expect(updated.count).toBe(0);

    const untouched = await admin.invitation.findUnique({ where: { id: invitationA } });
    expect(untouched?.status).toBe('pending');
  });

  it('ترفض السياسة زرع دعوة في مؤسسة أخرى', async () => {
    await expect(
      asOrganization(orgB.organizationId, (tx) =>
        tx.invitation.create({
          data: {
            organizationId: orgA.organizationId,
            email: 'intruder@example.com',
            emailNormalized: 'intruder@example.com',
            tokenHash: `intruder-${Date.now()}`,
            roleId: memberRoleId,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  /**
   * التفويض المحدود لا يُزرع عبر الحدود.
   *
   * الحالة الأخطر: مؤسسة تكتب صفاً في `membership_scopes` يمنح أحد
   * أعضائها تفويضاً على إدارة في مؤسسة أخرى.
   */
  it('ترفض السياسة زرع تفويض إداري في مؤسسة أخرى', async () => {
    await expect(
      asOrganization(orgB.organizationId, (tx) =>
        tx.membershipScope.create({
          data: {
            organizationId: orgA.organizationId,
            membershipId: orgA.membershipId,
            roleId: memberRoleId,
            scopeType: 'department',
            scopeId: departmentA,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('لا تقرأ المؤسسة تفويضات غيرها', async () => {
    await admin.membershipScope.create({
      data: {
        organizationId: orgA.organizationId,
        membershipId: orgA.membershipId,
        roleId: memberRoleId,
        scopeType: 'branch',
        scopeId: branchA,
      },
    });

    const seen = await asOrganization(orgB.organizationId, (tx) => tx.membershipScope.findMany());
    expect(seen).toHaveLength(0);
  });

  it('لا تقرأ المؤسسة دفعات استيراد غيرها', async () => {
    await admin.employeeImport.create({
      data: {
        organizationId: orgA.organizationId,
        createdByUserId: orgA.userId,
        fileName: 'staff.csv',
      },
    });

    const seen = await asOrganization(orgB.organizationId, (tx) => tx.employeeImport.findMany());
    expect(seen).toHaveLength(0);
  });

  /**
   * دالة قبول الدعوة.
   *
   * تعمل بلا سياق مؤسسة لأن المدعو ليس عضواً بعد، فيجب أن تُرجع
   * وجهة الدعوة — ولا شيء غيرها.
   */
  it('تُرجع دالة القبول وجهة الدعوة بلا سياق مؤسسة', async () => {
    const invitation = await admin.invitation.findUnique({ where: { id: invitationA } });

    const rows = await app.$queryRaw<
      Array<{ organization_id: string; email_normalized: string; status: string }>
    >`SELECT * FROM invitation_by_token(${invitation?.tokenHash ?? ''})`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.organization_id).toBe(orgA.organizationId);
    expect(rows[0]?.status).toBe('pending');
  });

  it('لا تُرجع دالة القبول شيئاً لرمز مجهول', async () => {
    const rows = await app.$queryRaw<
      Array<{ organization_id: string }>
    >`SELECT * FROM invitation_by_token('not-a-real-hash')`;

    expect(rows).toHaveLength(0);
  });
});

describe('عزل الهوية المؤسسية', () => {
  let orgA: Awaited<ReturnType<typeof createTenant>>;
  let orgB: Awaited<ReturnType<typeof createTenant>>;
  let cardA: string;

  beforeAll(async () => {
    await resetData();
  });

  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  beforeEach(async () => {
    await resetData();
    orgA = await createTenant('brand-a');
    orgB = await createTenant('brand-b');

    const card = await admin.card.create({
      data: {
        organizationId: orgA.organizationId,
        ownerUserId: orgA.userId,
        slug: `brand-card-${Date.now()}`,
        status: 'draft',
        templateKey: 'classic',
        templateVersion: 1,
        defaultLocale: 'ar',
      },
    });
    cardA = card.id;

    await admin.brandKit.create({
      data: { organizationId: orgA.organizationId, primaryColor: '#0f766e' },
    });

    await admin.brandPolicy.create({
      data: {
        organizationId: orgA.organizationId,
        name: 'سياسة عامة',
        lockedFields: ['organizationName'],
        requireApproval: true,
      },
    });
  });

  it('لا تقرأ المؤسسة هوية غيرها ولا سياساتها', async () => {
    const seen = await asOrganization(orgB.organizationId, async (tx) => ({
      kits: await tx.brandKit.findMany(),
      policies: await tx.brandPolicy.findMany(),
    }));

    expect(seen.kits).toHaveLength(0);
    expect(seen.policies).toHaveLength(0);
  });

  /**
   * طلب التعديل يحمل **محتوى بطاقة غير منشور** — نصاً كتبه موظف ولم
   * يوافق عليه أحد بعد. تسريبه أسوأ من تسريب بطاقة منشورة.
   */
  it('لا تقرأ المؤسسة طلبات تعديل غيرها', async () => {
    await admin.cardChangeRequest.create({
      data: {
        organizationId: orgA.organizationId,
        cardId: cardA,
        requestedByUserId: orgA.userId,
        payload: { localizations: [{ locale: 'ar', jobTitle: 'سرّي' }] },
        baseRevision: 1,
      },
    });

    const seen = await asOrganization(orgB.organizationId, (tx) =>
      tx.cardChangeRequest.findMany(),
    );

    expect(seen).toHaveLength(0);
  });

  it('لا تقرأ المؤسسة نطاقات غيرها المخصصة', async () => {
    await admin.customDomain.create({
      data: {
        organizationId: orgA.organizationId,
        hostname: `cards-${Date.now()}.example.om`,
        verificationToken: 'token',
      },
    });

    const seen = await asOrganization(orgB.organizationId, (tx) => tx.customDomain.findMany());
    expect(seen).toHaveLength(0);
  });

  /** دالة التوجيه لا تُرجع نطاقاً غير مُفعَّل ولو كان مسجّلاً. */
  it('لا يوجّه المضيف غير المتحقَّق منه', async () => {
    const hostname = `pending-${Date.now()}.example.om`;

    await admin.customDomain.create({
      data: {
        organizationId: orgA.organizationId,
        hostname,
        verificationToken: 'token',
        status: 'pending',
      },
    });

    const rows = await app.$queryRaw<
      Array<{ organization_id: string }>
    >`SELECT * FROM public_domain_target(${hostname})`;

    expect(rows).toHaveLength(0);
  });

  it('يوجّه المضيف المُفعَّل إلى مؤسسته', async () => {
    const hostname = `live-${Date.now()}.example.om`;

    await admin.customDomain.create({
      data: {
        organizationId: orgA.organizationId,
        hostname,
        verificationToken: 'token',
        status: 'active',
        verifiedAt: new Date(),
      },
    });

    const rows = await app.$queryRaw<
      Array<{ organization_id: string }>
    >`SELECT * FROM public_domain_target(${hostname})`;

    expect(rows[0]?.organization_id).toBe(orgA.organizationId);
  });

  /** المؤسسة المحجوب وصولها العام لا تُخدَم على نطاقها المخصص. */
  it('يتوقف التوجيه فور حجب الوصول العام', async () => {
    const hostname = `blocked-${Date.now()}.example.om`;

    await admin.customDomain.create({
      data: {
        organizationId: orgA.organizationId,
        hostname,
        verificationToken: 'token',
        status: 'active',
        verifiedAt: new Date(),
      },
    });

    await admin.organization.update({
      where: { id: orgA.organizationId },
      data: { publicAccessBlockedAt: new Date() },
    });

    const rows = await app.$queryRaw<
      Array<{ organization_id: string }>
    >`SELECT * FROM public_domain_target(${hostname})`;

    expect(rows).toHaveLength(0);
  });
});
