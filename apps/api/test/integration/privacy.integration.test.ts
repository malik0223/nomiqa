import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withRlsContext } from '@nomiqa/database';
import { ProfileService } from '../../src/privacy/profile.service.js';
import { admin, app, createTenant, disconnectAll, resetData } from './helpers.js';

/**
 * اختبارات الخصوصية مقابل قاعدة بيانات حقيقية بدور مقيّد.
 *
 * تغطي ما لا تكفي فيه اختبارات الوحدة: أن سياسات RLS على جداول
 * الخصوصية تعزل فعلاً، وأن سجل طلب الحذف **يبقى** بعد حذف المستخدم.
 */
describe('الخصوصية وحقوق صاحب البيانات', () => {
  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  beforeEach(async () => {
    await resetData();
  });

  describe('عزل الموافقات', () => {
    it('يرى المستخدم موافقاته فقط', async () => {
      const mine = await createTenant('consent-mine');
      const other = await createTenant('consent-other');

      await admin.$executeRaw`SELECT set_config('app.user_id', ${mine.userId}, true)`;
      await admin.userConsent.createMany({
        data: [
          { userId: mine.userId, purpose: 'terms', granted: true, documentVersion: 'v1' },
          { userId: other.userId, purpose: 'terms', granted: true, documentVersion: 'v1' },
        ],
      });

      const visible = await withRlsContext(app, { userId: mine.userId }, (tx) =>
        tx.userConsent.findMany(),
      );

      expect(visible).toHaveLength(1);
      expect(visible[0]?.userId).toBe(mine.userId);
    });

    it('بدون سياق مستخدم لا تُرى أي موافقة', async () => {
      const tenant = await createTenant('consent-blind');
      await admin.userConsent.create({
        data: { userId: tenant.userId, purpose: 'terms', granted: true, documentVersion: 'v1' },
      });

      expect(await app.userConsent.count()).toBe(0);
    });

    it('لا يسجّل المستخدم موافقة باسم غيره', async () => {
      const mine = await createTenant('consent-writer');
      const other = await createTenant('consent-victim');

      await expect(
        withRlsContext(app, { userId: mine.userId }, (tx) =>
          tx.userConsent.create({
            data: {
              userId: other.userId,
              purpose: 'marketing',
              granted: true,
              documentVersion: 'v1',
            },
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('سحب الموافقة يُضاف صفاً ولا يعدّل السابق', async () => {
      const tenant = await createTenant('consent-history');

      await withRlsContext(app, { userId: tenant.userId }, async (tx) => {
        await tx.userConsent.create({
          data: {
            userId: tenant.userId,
            purpose: 'marketing',
            granted: true,
            documentVersion: 'v1',
          },
        });
        await tx.userConsent.create({
          data: {
            userId: tenant.userId,
            purpose: 'marketing',
            granted: false,
            documentVersion: 'v1',
          },
        });
      });

      const history = await withRlsContext(app, { userId: tenant.userId }, (tx) =>
        tx.userConsent.findMany({ orderBy: { createdAt: 'asc' } }),
      );

      // التاريخ كامل: الموافقة ثم السحب، لا صف واحد معدَّل.
      expect(history).toHaveLength(2);
      expect(history.map((row) => row.granted)).toEqual([true, false]);
    });
  });

  describe('طلبات صاحب البيانات', () => {
    it('يبقى سجل طلب الحذف بعد حذف المستخدم', async () => {
      const tenant = await createTenant('deletion-subject');

      await withRlsContext(app, { userId: tenant.userId }, (tx) =>
        tx.dataSubjectRequest.create({
          data: {
            subjectUserId: tenant.userId,
            subjectEmailHash: 'hash-of-email',
            type: 'deletion',
            status: 'pending',
          },
        }),
      );

      // حذف المستخدم كما يفعل الـWorker
      await admin.user.delete({ where: { id: tenant.userId } });

      // السجل يجب أن يبقى — لا مفتاح أجنبي يجرّه معه.
      const surviving = await withRlsContext(app, { userId: tenant.userId }, (tx) =>
        tx.dataSubjectRequest.findMany(),
      );

      expect(surviving).toHaveLength(1);
      expect(surviving[0]?.type).toBe('deletion');
    });

    it('يستطيع الـWorker تحديث الطلب بعد اختفاء المستخدم', async () => {
      const tenant = await createTenant('deletion-update');

      const created = await withRlsContext(app, { userId: tenant.userId }, (tx) =>
        tx.dataSubjectRequest.create({
          data: {
            subjectUserId: tenant.userId,
            subjectEmailHash: 'hash',
            type: 'deletion',
            status: 'processing',
          },
        }),
      );

      await admin.user.delete({ where: { id: tenant.userId } });

      // السياسة تقارن العمود بقيمة الجلسة لا بصف قائم، فالتحديث ممكن.
      const updated = await withRlsContext(app, { userId: tenant.userId }, (tx) =>
        tx.dataSubjectRequest.updateMany({
          where: { id: created.id },
          data: { status: 'completed', completedAt: new Date() },
        }),
      );

      expect(updated.count).toBe(1);
    });

    it('لا يرى المستخدم طلبات غيره', async () => {
      const mine = await createTenant('dsr-mine');
      const other = await createTenant('dsr-other');

      await admin.dataSubjectRequest.createMany({
        data: [
          { subjectUserId: mine.userId, subjectEmailHash: 'a', type: 'export' },
          { subjectUserId: other.userId, subjectEmailHash: 'b', type: 'export' },
        ],
      });

      const visible = await withRlsContext(app, { userId: mine.userId }, (tx) =>
        tx.dataSubjectRequest.findMany(),
      );

      expect(visible).toHaveLength(1);
      expect(visible[0]?.subjectEmailHash).toBe('a');
    });
  });

  describe('حق التصحيح', () => {
    it('تعديل الاسم ينشئ سجل تصحيح مكتملاً', async () => {
      const tenant = await createTenant('rectify-name');
      const service = new ProfileService(admin as never);

      await service.update(tenant.userId, { fullName: 'اسم مصحّح' });

      const requests = await withRlsContext(app, { userId: tenant.userId }, (tx) =>
        tx.dataSubjectRequest.findMany(),
      );

      expect(requests).toHaveLength(1);
      expect(requests[0]?.type).toBe('rectification');
      expect(requests[0]?.status).toBe('completed');
      expect(requests[0]?.completedAt).not.toBeNull();
    });

    it('السجل يحفظ أسماء الحقول لا قيمها', async () => {
      const tenant = await createTenant('rectify-outcome');
      const service = new ProfileService(admin as never);

      await service.update(tenant.userId, { fullName: 'قيمة حساسة جداً' });

      const request = await withRlsContext(app, { userId: tenant.userId }, (tx) =>
        tx.dataSubjectRequest.findFirst(),
      );

      const serialized = JSON.stringify(request?.outcome);
      expect(serialized).toContain('fullName');
      // القيمة نفسها يجب ألا تُخزَّن، وإلا صار السجل نسخة من البيانات.
      expect(serialized).not.toContain('قيمة حساسة');
    });

    it('تغيير التفضيلات وحدها لا ينشئ سجل تصحيح', async () => {
      const tenant = await createTenant('rectify-prefs');
      const service = new ProfileService(admin as never);

      await service.update(tenant.userId, { locale: 'en', timeZone: 'Asia/Dubai' });

      const requests = await withRlsContext(app, { userId: tenant.userId }, (tx) =>
        tx.dataSubjectRequest.findMany(),
      );

      expect(requests).toHaveLength(0);

      // لكن التفضيلات حُفظت فعلاً
      const user = await admin.user.findUnique({ where: { id: tenant.userId } });
      expect(user?.locale).toBe('en');
      expect(user?.timeZone).toBe('Asia/Dubai');
    });

    it('إرسال القيمة نفسها لا ينشئ سجلاً', async () => {
      const tenant = await createTenant('rectify-noop');
      const service = new ProfileService(admin as never);

      await service.update(tenant.userId, { fullName: 'اسم ثابت' });
      await service.update(tenant.userId, { fullName: 'اسم ثابت' });

      const requests = await withRlsContext(app, { userId: tenant.userId }, (tx) =>
        tx.dataSubjectRequest.findMany(),
      );

      // تغيير واحد فعلي = سجل واحد
      expect(requests).toHaveLength(1);
    });

    it('لا يعدّل حساباً محذوفاً', async () => {
      const tenant = await createTenant('rectify-deleted');
      await admin.user.update({
        where: { id: tenant.userId },
        data: { deletedAt: new Date() },
      });

      const service = new ProfileService(admin as never);

      await expect(service.update(tenant.userId, { fullName: 'محاولة' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('أثر الحذف على البيانات المرتبطة', () => {
    it('حذف المستخدم يجرّ موافقاته وعضوياته', async () => {
      const tenant = await createTenant('cascade');

      await admin.userConsent.create({
        data: { userId: tenant.userId, purpose: 'terms', granted: true, documentVersion: 'v1' },
      });

      await admin.user.delete({ where: { id: tenant.userId } });

      expect(await admin.userConsent.count()).toBe(0);
      expect(await admin.organizationMembership.count({ where: { userId: tenant.userId } })).toBe(
        0,
      );
    });

    it('سجل التدقيق يبقى بلا هوية بعد حذف الفاعل', async () => {
      const tenant = await createTenant('audit-actor');

      await admin.$executeRaw`SELECT set_config('app.organization_id', ${tenant.organizationId}, true)`;
      await admin.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId: tenant.userId,
          action: 'test.action',
          resourceType: 'test',
        },
      });

      await admin.user.delete({ where: { id: tenant.userId } });

      const logs = await admin.auditLog.findMany({
        where: { organizationId: tenant.organizationId },
      });

      // السجل باقٍ كأثر تشغيلي، لكن بلا هوية الفاعل.
      expect(logs).toHaveLength(1);
      expect(logs[0]?.actorUserId).toBeNull();
      expect(logs[0]?.action).toBe('test.action');
    });
  });
});
