import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { admin, app, asOrganization, createTenant, disconnectAll, resetData } from './helpers.js';

/**
 * المبيعات والفعاليات والتكاملات (§11).
 *
 * أربعة أشياء لا يمكن اختبارها إلا بقاعدة بيانات حقيقية، وثلاثة منها
 * تفشل **بصمت** إن انكسرت:
 *
 *  1. **`card_event_at`.** تُستدعى من مسار الالتقاط العام الذي يعمل
 *     بلا سياق مؤسسة. خطأ في شرط النافذة لا يُنتج استثناءً بل ينسب
 *     عملاء معرض إلى معرض آخر — أو لا ينسبهم إلى شيء.
 *  2. **الفريد على (وجهة، حدث) و(وصلة، جهة اتصال).** هو **كل** ما
 *     يمنع التسليم المكرر والعميل المكرر في نظام العميل. قيدٌ سقط من
 *     مهاجرة لا يظهر إلا في قاعدة بيانات عميل بعد شهر.
 *  3. **عزل الجداول الجديدة.** ثلاثة منها تحمل أسراراً: تجزئة مفتاح،
 *     وسرّ توقيع، ورمز وصول إلى نظام طرف ثالث.
 *  4. **الفريد العالمي على تجزئة المفتاح.** البحث عنه يقع قبل وجود
 *     أي سياق مؤسسة، فلا تحميه سياسة عزل.
 */
describe('الفعاليات والتكاملات', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let cardId: string;

  beforeAll(async () => {
    await resetData();
  });

  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  beforeEach(async () => {
    await resetData();
    tenant = await createTenant('sales-a');
    other = await createTenant('sales-b');

    const card = await admin.card.create({
      data: {
        organizationId: tenant.organizationId,
        ownerUserId: tenant.userId,
        slug: `sales-card-${Date.now()}`,
        status: 'published',
        templateKey: 'classic',
        templateVersion: 1,
        defaultLocale: 'ar',
        publishedAt: new Date(),
        localizations: { create: { locale: 'ar', fullName: 'سالم الهنائي' } },
      },
    });

    cardId = card.id;
  });

  // ---------------------------------------------------------------
  // إسناد الفعالية
  // ---------------------------------------------------------------

  describe('card_event_at', () => {
    it('ينسب البطاقة إلى فعالية جارية', async () => {
      const event = await createEvent({ offsetHours: -2, durationHours: 48, linkCard: true });

      expect(await resolveEvent(cardId, new Date())).toBe(event.id);
    });

    /**
     * القرار المركزي، وهو نفسه قرار الحملات في المرحلة 5: النافذة
     * تحكم **الإسناد لا الوصول**. البطاقة تبقى تعمل بعد إغلاق القاعة —
     * رابطها مطبوع على ما وُزّع فيها — ومن يفتحها بعدها ليس من عملاء
     * ذلك المعرض.
     */
    it('لا ينسب بعد انتهاء النافذة', async () => {
      await createEvent({ offsetHours: -72, durationHours: 48, linkCard: true });

      expect(await resolveEvent(cardId, new Date())).toBeNull();
    });

    it('لا ينسب قبل بداية النافذة', async () => {
      await createEvent({ offsetHours: 24, durationHours: 48, linkCard: true });

      expect(await resolveEvent(cardId, new Date())).toBeNull();
    });

    it('لا ينسب بطاقة غير مربوطة بالفعالية', async () => {
      await createEvent({ offsetHours: -2, durationHours: 48, linkCard: false });

      expect(await resolveEvent(cardId, new Date())).toBeNull();
    });

    /**
     * بطاقة واحدة في معرضين متداخلين: نختار الأحدث بدايةً — وهو
     * الأقرب إلى ما يقصده من ربط البطاقة بالفعالية الجارية للتو.
     */
    it('يختار الأحدث بدايةً عند تداخل فعاليتين', async () => {
      await createEvent({ offsetHours: -48, durationHours: 96, linkCard: true });
      const newer = await createEvent({ offsetHours: -2, durationHours: 48, linkCard: true });

      expect(await resolveEvent(cardId, new Date())).toBe(newer.id);
    });
  });

  // ---------------------------------------------------------------
  // قيود عدم التكرار
  // ---------------------------------------------------------------

  describe('قيود عدم التكرار', () => {
    it('يمنع تسليمين للحدث نفسه إلى الوجهة نفسها', async () => {
      const endpoint = await createEndpoint();
      const eventId = crypto.randomUUID();

      await admin.webhookDelivery.create({
        data: {
          organizationId: tenant.organizationId,
          endpointId: endpoint.id,
          eventType: 'contact.captured',
          eventId,
          payload: {},
        },
      });

      await expect(
        admin.webhookDelivery.create({
          data: {
            organizationId: tenant.organizationId,
            endpointId: endpoint.id,
            eventType: 'contact.captured',
            eventId,
            payload: {},
          },
        }),
      ).rejects.toThrow();
    });

    it('يمنع صفّي مزامنة لجهة الاتصال نفسها على الوصلة نفسها', async () => {
      const connection = await createConnection();
      const contact = await createContact();

      await admin.crmSyncLog.create({
        data: {
          organizationId: tenant.organizationId,
          connectionId: connection.id,
          contactId: contact.id,
        },
      });

      const second = await admin.crmSyncLog.createMany({
        data: [
          {
            organizationId: tenant.organizationId,
            connectionId: connection.id,
            contactId: contact.id,
          },
        ],
        // نفس ما يفعله جدولة المزامنة: تشغيلها مرتين لا يضاعف شيئاً.
        skipDuplicates: true,
      });

      expect(second.count).toBe(0);
    });

    it('يمنع مفتاحين بالتجزئة نفسها ولو في مؤسستين', async () => {
      const tokenHash = `hash-${Date.now()}`;

      await admin.apiKey.create({
        data: {
          organizationId: tenant.organizationId,
          name: 'مفتاح',
          prefix: 'aaaaaaaa',
          tokenHash,
          scopes: ['contacts:read'],
        },
      });

      await expect(
        admin.apiKey.create({
          data: {
            organizationId: other.organizationId,
            name: 'مفتاح',
            prefix: 'bbbbbbbb',
            tokenHash,
            scopes: ['contacts:read'],
          },
        }),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // العزل
  // ---------------------------------------------------------------

  describe('عزل جداول المرحلة 6', () => {
    it('يمنع مؤسسة من رؤية فعاليات غيرها ومفاتيحها ووصلاتها', async () => {
      await createEvent({ offsetHours: -2, durationHours: 48, linkCard: true });
      await createEndpoint();
      await createConnection();
      await admin.apiKey.create({
        data: {
          organizationId: tenant.organizationId,
          name: 'مفتاح',
          prefix: 'cccccccc',
          tokenHash: `hash-${Date.now()}`,
          scopes: ['contacts:read'],
        },
      });
      await admin.scanJob.create({
        data: { organizationId: tenant.organizationId, kind: 'business_card', status: 'review' },
      });

      const mine = await asOrganization(tenant.organizationId, async (tx) => ({
        events: await tx.event.count(),
        eventCards: await tx.eventCard.count(),
        keys: await tx.apiKey.count(),
        endpoints: await tx.webhookEndpoint.count(),
        connections: await tx.crmConnection.count(),
        scans: await tx.scanJob.count(),
      }));

      expect(mine).toEqual({
        events: 1,
        eventCards: 1,
        keys: 1,
        endpoints: 1,
        connections: 1,
        scans: 1,
      });

      const theirs = await asOrganization(other.organizationId, async (tx) => ({
        events: await tx.event.count(),
        eventCards: await tx.eventCard.count(),
        keys: await tx.apiKey.count(),
        endpoints: await tx.webhookEndpoint.count(),
        connections: await tx.crmConnection.count(),
        scans: await tx.scanJob.count(),
      }));

      expect(theirs).toEqual({
        events: 0,
        eventCards: 0,
        keys: 0,
        endpoints: 0,
        connections: 0,
        scans: 0,
      });
    });

    it('يحجب أسرار التكاملات تماماً بلا سياق مؤسسة', async () => {
      await createEndpoint();
      await createConnection();

      // ثلاثة جداول تحمل أسراراً: تجزئة مفتاح، وسرّ توقيع نوقّع به
      // نيابة عن المؤسسة، ورمز وصول إلى نظام طرف ثالث.
      expect(await app.webhookEndpoint.count()).toBe(0);
      expect(await app.crmConnection.count()).toBe(0);
      expect(await app.apiKey.count()).toBe(0);
    });

    it('يمنع الكتابة في مؤسسة أخرى حتى بتمرير معرّفها صراحةً', async () => {
      await expect(
        asOrganization(other.organizationId, (tx) =>
          tx.event.create({
            data: {
              organizationId: tenant.organizationId,
              name: 'فعالية مسروقة',
              startsAt: new Date(),
              endsAt: new Date(Date.now() + 86_400_000),
            },
          }),
        ),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // الحذف
  // ---------------------------------------------------------------

  describe('أثر الحذف', () => {
    /**
     * حذف الفعالية قرار تنظيمي، ومحو عملاء جمعهم فريق في ثلاثة أيام
     * إتلافٌ لا يقصده من ضغط «حذف الفعالية».
     */
    it('يُبقي جهات الاتصال بعد حذف فعاليتها', async () => {
      const event = await createEvent({ offsetHours: -2, durationHours: 48, linkCard: true });
      const contact = await createContact({ eventId: event.id });

      await admin.event.delete({ where: { id: event.id } });

      const kept = await admin.contact.findUnique({ where: { id: contact.id } });
      expect(kept).not.toBeNull();
      expect(kept?.eventId).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // أدوات
  // ---------------------------------------------------------------

  async function createEvent(options: {
    offsetHours: number;
    durationHours: number;
    linkCard: boolean;
  }) {
    const startsAt = new Date(Date.now() + options.offsetHours * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + options.durationHours * 3_600_000);

    return admin.event.create({
      data: {
        organizationId: tenant.organizationId,
        name: 'معرض اختبار',
        startsAt,
        endsAt,
        ...(options.linkCard
          ? { cards: { create: { cardId, organizationId: tenant.organizationId } } }
          : {}),
      },
    });
  }

  async function createEndpoint() {
    return admin.webhookEndpoint.create({
      data: {
        organizationId: tenant.organizationId,
        url: 'https://example.com/hook',
        secret: 'whsec_test',
        eventTypes: ['contact.captured'],
      },
    });
  }

  async function createConnection() {
    return admin.crmConnection.create({
      data: {
        organizationId: tenant.organizationId,
        provider: 'hubspot',
        accessToken: 'pat-test-token',
        fieldMap: { email: 'email' },
      },
    });
  }

  async function createContact(options: { eventId?: string } = {}) {
    return admin.contact.create({
      data: {
        organizationId: tenant.organizationId,
        cardId,
        fullName: 'خالد العامري',
        source: 'scan',
        eventId: options.eventId ?? null,
        ownerUserId: tenant.userId,
      },
    });
  }

  async function resolveEvent(card: string, at: Date): Promise<string | null> {
    const rows = await admin.$queryRawUnsafe<Array<{ card_event_at: string | null }>>(
      `SELECT card_event_at($1::uuid, $2::timestamptz)`,
      card,
      at,
    );

    return rows[0]?.card_event_at ?? null;
  }
});
