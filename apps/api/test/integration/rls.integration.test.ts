import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { admin, app, asOrganization, createTenant, disconnectAll, resetData } from './helpers.js';
import { TEST_ROLE } from './global-setup.js';

/**
 * اختبارات عزل البيانات على مستوى قاعدة البيانات.
 *
 * هذه هي «الطبقة الخامسة» من طبقات العزل الست في وثيقة المعمارية §6.3:
 * اختبارات آلية لمحاولات الوصول بين المؤسسات.
 *
 * تعمل كلها بدور NOBYPASSRLS لأن سياسات RLS لا تنطبق على superuser،
 * وتشغيلها بدور مميّز يجعلها تمر بلا أن تختبر شيئاً.
 */
describe('عزل بيانات المؤسسات عبر RLS', () => {
  let orgA: Awaited<ReturnType<typeof createTenant>>;
  let orgB: Awaited<ReturnType<typeof createTenant>>;

  beforeAll(async () => {
    await resetData();
  });

  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  beforeEach(async () => {
    await resetData();
    orgA = await createTenant('a');
    orgB = await createTenant('b');
  });

  describe('صحة بيئة الاختبار نفسها', () => {
    it('الدور المستخدم لا يملك superuser ولا bypassrls', async () => {
      const rows = await app.$queryRaw<
        Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>
      >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

      expect(rows[0]?.rolname).toBe(TEST_ROLE);
      // لو صار أي منهما true فكل ما تحته من تأكيدات يفقد معناه.
      expect(rows[0]?.rolsuper).toBe(false);
      expect(rows[0]?.rolbypassrls).toBe(false);
    });

    it('سياسات RLS مفعّلة وبـFORCE على الجداول الحسّاسة', async () => {
      const rows = await app.$queryRaw<
        Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>
      >`
        SELECT relname, relrowsecurity, relforcerowsecurity
        FROM pg_class
        WHERE relname IN (
          'organization_memberships', 'audit_logs', 'outbox_events',
          'file_objects', 'notification_deliveries'
        )
      `;

      expect(rows).toHaveLength(5);
      for (const row of rows) {
        expect(row.relrowsecurity, `${row.relname} بلا RLS`).toBe(true);
        // بدون FORCE يتجاوز مالك الجدول السياسات.
        expect(row.relforcerowsecurity, `${row.relname} بلا FORCE`).toBe(true);
      }
    });
  });

  describe('القراءة', () => {
    it('بدون سياق مؤسسة لا يرى أي صف', async () => {
      const count = await app.organizationMembership.count();
      expect(count).toBe(0);
    });

    it('بسياق مؤسسة يرى صفوفها فقط', async () => {
      const seenByA = await asOrganization(orgA.organizationId, (tx) =>
        tx.organizationMembership.findMany(),
      );

      expect(seenByA).toHaveLength(1);
      expect(seenByA[0]?.organizationId).toBe(orgA.organizationId);
    });

    it('لا يرى صفوف مؤسسة أخرى حتى بالاستعلام المباشر عن معرّفها', async () => {
      const found = await asOrganization(orgA.organizationId, (tx) =>
        tx.organizationMembership.findUnique({ where: { id: orgB.membershipId } }),
      );

      expect(found).toBeNull();
    });

    it('سياق مؤسسة ب يرى صفوف ب فقط', async () => {
      const seenByB = await asOrganization(orgB.organizationId, (tx) =>
        tx.organizationMembership.findMany(),
      );

      expect(seenByB).toHaveLength(1);
      expect(seenByB[0]?.organizationId).toBe(orgB.organizationId);
    });
  });

  describe('الكتابة', () => {
    it('يرفض إدراج صف يخص مؤسسة أخرى', async () => {
      const otherUser = await admin.user.create({
        data: {
          auth0UserId: `auth0|intruder-${Date.now()}`,
          email: `intruder.${Date.now()}@test.local`,
        },
      });

      await expect(
        asOrganization(orgA.organizationId, (tx) =>
          tx.organizationMembership.create({
            data: {
              organizationId: orgB.organizationId,
              userId: otherUser.id,
              status: 'active',
            },
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('يرفض نقل صف إلى مؤسسة أخرى بالتحديث', async () => {
      await expect(
        asOrganization(orgA.organizationId, (tx) =>
          tx.organizationMembership.update({
            where: { id: orgA.membershipId },
            data: { organizationId: orgB.organizationId },
          }),
        ),
      ).rejects.toThrow();

      // الصف بقي في مؤسسته الأصلية
      const unchanged = await admin.organizationMembership.findUnique({
        where: { id: orgA.membershipId },
      });
      expect(unchanged?.organizationId).toBe(orgA.organizationId);
    });

    it('لا يحذف صفوف مؤسسة أخرى', async () => {
      const deleted = await asOrganization(orgA.organizationId, (tx) =>
        tx.organizationMembership.deleteMany({ where: { id: orgB.membershipId } }),
      );

      expect(deleted.count).toBe(0);

      const survived = await admin.organizationMembership.findUnique({
        where: { id: orgB.membershipId },
      });
      expect(survived).not.toBeNull();
    });

    it('لا يعدّل صفوف مؤسسة أخرى بالتحديث الجماعي', async () => {
      const updated = await asOrganization(orgA.organizationId, (tx) =>
        tx.organizationMembership.updateMany({ data: { status: 'revoked' } }),
      );

      expect(updated.count).toBe(1);

      const untouched = await admin.organizationMembership.findUnique({
        where: { id: orgB.membershipId },
      });
      expect(untouched?.status).toBe('active');
    });
  });

  describe('تسرّب السياق بين الاتصالات', () => {
    it('ينتهي السياق بانتهاء المعاملة ولا يبقى على الاتصال', async () => {
      await asOrganization(orgA.organizationId, (tx) => tx.organizationMembership.findMany());

      // الاتصال نفسه قد يُعاد استخدامه لطلب مؤسسة أخرى.
      const afterTransaction = await app.organizationMembership.count();
      expect(afterTransaction).toBe(0);
    });

    it('لا يرث سياق مؤسسة سابقة داخل معاملة جديدة', async () => {
      await asOrganization(orgA.organizationId, (tx) => tx.organizationMembership.findMany());

      const seenByB = await asOrganization(orgB.organizationId, (tx) =>
        tx.organizationMembership.findMany(),
      );

      expect(seenByB).toHaveLength(1);
      expect(seenByB[0]?.organizationId).toBe(orgB.organizationId);
    });
  });

  describe('سجل التدقيق والـoutbox', () => {
    beforeEach(async () => {
      await admin.auditLog.createMany({
        data: [
          { organizationId: orgA.organizationId, action: 'test.a', resourceType: 'test' },
          { organizationId: orgB.organizationId, action: 'test.b', resourceType: 'test' },
        ],
      });

      await admin.outboxEvent.createMany({
        data: [
          { organizationId: orgA.organizationId, eventType: 'test.a', payload: {} },
          { organizationId: orgB.organizationId, eventType: 'test.b', payload: {} },
        ],
      });
    });

    it('سجل التدقيق معزول بين المؤسسات', async () => {
      const logs = await asOrganization(orgA.organizationId, (tx) => tx.auditLog.findMany());

      expect(logs).toHaveLength(1);
      expect(logs[0]?.action).toBe('test.a');
    });

    it('أحداث outbox معزولة بين المؤسسات', async () => {
      const events = await asOrganization(orgA.organizationId, (tx) => tx.outboxEvent.findMany());

      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('test.a');
    });

    it('الملفات معزولة بين المؤسسات', async () => {
      await admin.$executeRaw`SELECT set_config('app.organization_id', ${orgA.organizationId}, true)`;
      await admin.fileObject.createMany({
        data: [
          {
            organizationId: orgA.organizationId,
            storageKey: `${orgA.organizationId}/avatar/a.png`,
            purpose: 'avatar',
            mimeType: 'image/png',
            sizeBytes: 100,
          },
          {
            organizationId: orgB.organizationId,
            storageKey: `${orgB.organizationId}/avatar/b.png`,
            purpose: 'avatar',
            mimeType: 'image/png',
            sizeBytes: 100,
          },
        ],
      });

      const files = await asOrganization(orgA.organizationId, (tx) => tx.fileObject.findMany());

      expect(files).toHaveLength(1);
      expect(files[0]?.organizationId).toBe(orgA.organizationId);
    });

    it('سجلات الإشعارات معزولة بين المؤسسات', async () => {
      await admin.notificationDelivery.createMany({
        data: [
          {
            organizationId: orgA.organizationId,
            channel: 'email',
            template: 'welcome',
            recipientHash: 'hash-a',
          },
          {
            organizationId: orgB.organizationId,
            channel: 'email',
            template: 'welcome',
            recipientHash: 'hash-b',
          },
        ],
      });

      const deliveries = await asOrganization(orgA.organizationId, (tx) =>
        tx.notificationDelivery.findMany(),
      );

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.recipientHash).toBe('hash-a');
    });

    it('لا يُكتب سجل تدقيق باسم مؤسسة أخرى', async () => {
      await expect(
        asOrganization(orgA.organizationId, (tx) =>
          tx.auditLog.create({
            data: {
              organizationId: orgB.organizationId,
              action: 'forged',
              resourceType: 'test',
            },
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});
