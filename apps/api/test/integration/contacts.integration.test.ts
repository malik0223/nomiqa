import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { admin, app, asOrganization, createTenant, disconnectAll, resetData } from './helpers.js';

/**
 * عزل جهات الاتصال والتحليلات.
 *
 * هذه أثقل بيانات المنصة حساسيةً: بيانات أشخاص لم يسجّلوا في المنصة
 * ولا يعرفون بوجودها، فتسريبها بين مؤسستين خرقٌ يخص من لا يستطيع أن
 * يشتكي منه. الاختبارات هنا ليست تغطية شكلية — هي الضمان الوحيد أن
 * سياسة كُتبت مرة تبقى صحيحة بعد كل تعديل على المخطط.
 *
 * `contact_tags` تستحق اختباراً خاصاً: جدول وصل بلا `organization_id`،
 * وسياسته تشترط رؤية **طرفيه معاً**.
 */
describe('عزل جهات الاتصال', () => {
  let orgA: Awaited<ReturnType<typeof createTenant>>;
  let orgB: Awaited<ReturnType<typeof createTenant>>;
  let contactA: string;
  let tagA: string;
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
    orgA = await createTenant('contacts-a');
    orgB = await createTenant('contacts-b');

    const card = await admin.card.create({
      data: {
        organizationId: orgA.organizationId,
        ownerUserId: orgA.userId,
        slug: `contact-card-${Date.now()}`,
        status: 'published',
        templateKey: 'classic',
        templateVersion: 1,
        defaultLocale: 'ar',
        publishedAt: new Date(),
        contactForm: {
          enabled: true,
          fields: [{ key: 'email', required: true }],
          customFields: [],
        },
        localizations: { create: { locale: 'ar', fullName: 'سالم الهنائي' } },
      },
    });
    cardA = card.id;

    const tag = await admin.tag.create({
      data: { organizationId: orgA.organizationId, name: 'عميل محتمل' },
    });
    tagA = tag.id;

    const contact = await admin.contact.create({
      data: {
        organizationId: orgA.organizationId,
        cardId: cardA,
        fullName: 'زائر المعرض',
        email: 'visitor@example.com',
        emailNormalized: 'visitor@example.com',
        source: 'card_form',
        consents: {
          create: {
            organizationId: orgA.organizationId,
            purpose: 'contact_storage',
            granted: true,
            consentTextVersion: '2026-08-16',
          },
        },
        notes: {
          create: { organizationId: orgA.organizationId, body: 'قابلته في جناح المنصة' },
        },
        tags: { create: { tagId: tagA } },
        followUps: {
          create: {
            organizationId: orgA.organizationId,
            title: 'إرسال العرض',
            dueAt: new Date(Date.now() + 86_400_000),
          },
        },
      },
    });
    contactA = contact.id;
  });

  it('مؤسسة أخرى لا ترى جهة الاتصال', async () => {
    const seen = await asOrganization(orgB.organizationId, (tx) =>
      tx.contact.findMany({ where: { id: contactA } }),
    );

    expect(seen).toHaveLength(0);
  });

  it('مؤسسة أخرى لا ترى سجل الموافقة', async () => {
    // سجل الموافقة يربط بريد شخص بمؤسسة بعينها — تسريبه يكشف أن
    // فلاناً تواصل مع فلان.
    const seen = await asOrganization(orgB.organizationId, (tx) =>
      tx.contactConsent.findMany({ where: { contactId: contactA } }),
    );

    expect(seen).toHaveLength(0);
  });

  it('مؤسسة أخرى لا ترى الملاحظات ولا التذكيرات', async () => {
    const [notes, followUps] = await asOrganization(orgB.organizationId, async (tx) => [
      await tx.contactNote.findMany({ where: { contactId: contactA } }),
      await tx.followUpTask.findMany({ where: { contactId: contactA } }),
    ]);

    expect(notes).toHaveLength(0);
    expect(followUps).toHaveLength(0);
  });

  it('مؤسسة أخرى لا ترى التصنيفات ولا روابطها', async () => {
    const [tags, links] = await asOrganization(orgB.organizationId, async (tx) => [
      await tx.tag.findMany({ where: { id: tagA } }),
      await tx.contactTag.findMany({ where: { contactId: contactA } }),
    ]);

    expect(tags).toHaveLength(0);
    expect(links).toHaveLength(0);
  });

  it('صاحبة البيانات ترى كل ما يخصها', async () => {
    const contact = await asOrganization(orgA.organizationId, (tx) =>
      tx.contact.findFirst({
        where: { id: contactA },
        include: { consents: true, notes: true, tags: true, followUps: true },
      }),
    );

    expect(contact?.consents).toHaveLength(1);
    expect(contact?.notes).toHaveLength(1);
    expect(contact?.tags).toHaveLength(1);
    expect(contact?.followUps).toHaveLength(1);
  });

  it('لا يمكن وسم جهة اتصال بتصنيف مؤسسة أخرى', async () => {
    // الحالة الخبيثة التي تبررها سياسة الطرفين: مؤسسة B تعرف معرّف
    // تصنيف A (بتسريب أو تخمين) وتحاول ربطه بجهة اتصال عندها.
    const contactB = await admin.contact.create({
      data: { organizationId: orgB.organizationId, fullName: 'جهة أخرى', source: 'manual' },
    });

    await expect(
      asOrganization(orgB.organizationId, (tx) =>
        tx.contactTag.create({ data: { contactId: contactB.id, tagId: tagA } }),
      ),
    ).rejects.toThrow();
  });

  it('بلا سياق مؤسسة لا تظهر جهة اتصال واحدة', async () => {
    // الحالة الأخطر: استعلام أفلت من withRlsContext. السياسة تمنع
    // كل الصفوف لأن app_current_organization_id() تُرجع NULL.
    const seen = await app.contact.findMany();

    expect(seen).toHaveLength(0);
  });
});

describe('عزل التحليلات', () => {
  let orgA: Awaited<ReturnType<typeof createTenant>>;
  let orgB: Awaited<ReturnType<typeof createTenant>>;
  let cardA: string;
  let slugA: string;

  beforeAll(async () => {
    await resetData();
  });

  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  beforeEach(async () => {
    await resetData();
    orgA = await createTenant('analytics-a');
    orgB = await createTenant('analytics-b');

    slugA = `analytics-card-${Date.now()}`;
    const card = await admin.card.create({
      data: {
        organizationId: orgA.organizationId,
        ownerUserId: orgA.userId,
        slug: slugA,
        status: 'published',
        templateKey: 'classic',
        templateVersion: 1,
        defaultLocale: 'ar',
        publishedAt: new Date(),
        localizations: { create: { locale: 'ar', fullName: 'سالم الهنائي' } },
      },
    });
    cardA = card.id;
  });

  it('الإدراج يشتق المؤسسة من البطاقة لا من المدخل', async () => {
    // الضمان الجوهري: الدالة لا تقبل organization_id إطلاقاً، فلا
    // يستطيع مرسِل أن يكتب أحداثاً في مؤسسة يختارها.
    await admin.$executeRawUnsafe(
      `SELECT analytics_ingest($1::jsonb)`,
      JSON.stringify([
        {
          slug: slugA,
          type: 'view',
          // نفس تهجئة `AnalyticsIngestEvent` حرفياً: الدالة تطابق
          // المفاتيح بالاسم، وتهجئة مختلفة هنا كانت ستجعل الاختبار
          // يمر بينما المسار الحقيقي يُسقط كل حدث بصمت.
          linkId: null,
          visitorHash: 'hash-one',
          locale: 'ar',
          referrerHost: null,
          deviceType: 'mobile',
          occurredAt: new Date().toISOString(),
        },
      ]),
    );

    const events = await admin.cardEvent.findMany({ where: { cardId: cardA } });

    expect(events).toHaveLength(1);
    expect(events[0]?.organizationId).toBe(orgA.organizationId);

    // نتحقق من الحقول لا من العدد وحده: مفتاح لا تعرفه الدالة يصل
    // NULL بلا خطأ، فاختبار يفحص العدد فقط يمر على حمولة نصفها ضائع.
    expect(events[0]?.visitorHash).toBe('hash-one');
    expect(events[0]?.deviceType).toBe('mobile');
    expect(events[0]?.occurredAt).toBeInstanceOf(Date);
  });

  it('يُسقط أحداث slug غير منشور بلا خطأ', async () => {
    const inserted = await admin.$queryRawUnsafe<Array<{ analytics_ingest: number }>>(
      `SELECT analytics_ingest($1::jsonb)`,
      JSON.stringify([
        {
          slug: 'no-such-card',
          type: 'view',
          linkId: null,
          visitorHash: 'hash-two',
          locale: 'ar',
          referrerHost: null,
          deviceType: 'desktop',
          occurredAt: new Date().toISOString(),
        },
      ]),
    );

    expect(inserted[0]?.analytics_ingest).toBe(0);
  });

  it('مؤسسة أخرى لا ترى الأحداث ولا التجميعات', async () => {
    await admin.cardEvent.create({
      data: {
        organizationId: orgA.organizationId,
        cardId: cardA,
        type: 'view',
        visitorHash: 'hash-three',
        occurredAt: new Date(),
      },
    });

    await admin.analyticsRollup.create({
      data: {
        organizationId: orgA.organizationId,
        cardId: cardA,
        bucket: 'day',
        bucketStart: new Date(),
        metric: 'view',
        count: 1,
      },
    });

    const [events, rollups] = await asOrganization(orgB.organizationId, async (tx) => [
      await tx.cardEvent.findMany({ where: { cardId: cardA } }),
      await tx.analyticsRollup.findMany({ where: { cardId: cardA } }),
    ]);

    expect(events).toHaveLength(0);
    expect(rollups).toHaveLength(0);
  });

  it('إعادة التجميع لا تضاعف الأعداد', async () => {
    // الضمان الذي تعتمد عليه المهمة الدورية: تعمل كل خمس دقائق على
    // مدى متداخل، ولو كانت تراكمية لتضخّمت الأرقام كل دورة.
    const occurredAt = new Date();

    await admin.cardEvent.createMany({
      data: [
        {
          organizationId: orgA.organizationId,
          cardId: cardA,
          type: 'view',
          visitorHash: 'visitor-1',
          occurredAt,
        },
        {
          organizationId: orgA.organizationId,
          cardId: cardA,
          type: 'view',
          visitorHash: 'visitor-1',
          occurredAt,
        },
        {
          organizationId: orgA.organizationId,
          cardId: cardA,
          type: 'view',
          visitorHash: 'visitor-2',
          occurredAt,
        },
      ],
    });

    const from = new Date(Date.now() - 3_600_000);
    const to = new Date(Date.now() + 3_600_000);

    await admin.$executeRawUnsafe(`SELECT analytics_rollup_range('day', $1, $2)`, from, to);
    await admin.$executeRawUnsafe(`SELECT analytics_rollup_range('day', $1, $2)`, from, to);

    const rollups = await admin.analyticsRollup.findMany({ where: { cardId: cardA } });
    const views = rollups.find((row) => row.metric === 'view');
    const unique = rollups.find((row) => row.metric === 'unique_visitor');

    expect(views?.count).toBe(3);
    // زائران اثنان رغم ثلاث مشاهدات — هذا هو الفرق الذي يوثّقه
    // docs/analytics/definitions.md.
    expect(unique?.count).toBe(2);
  });
});
