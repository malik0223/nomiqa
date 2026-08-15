import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { admin, app, asOrganization, createTenant, disconnectAll, resetData } from './helpers.js';

/**
 * عزل البطاقات ونشرها.
 *
 * جدولا `card_localizations` و`card_links` لا يحملان `organization_id`
 * — يُعزلان بالانتماء إلى بطاقة مرئية عبر `EXISTS`. سياسة كهذه سهلة
 * الكسر عند أي تعديل لاحق، فهذه الاختبارات هي ما يمنع كسرها صامتاً.
 */
describe('عزل البطاقات', () => {
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
    orgA = await createTenant('cards-a');
    orgB = await createTenant('cards-b');

    const card = await admin.card.create({
      data: {
        organizationId: orgA.organizationId,
        ownerUserId: orgA.userId,
        slug: `salim-${Date.now()}`,
        status: 'draft',
        templateKey: 'classic',
        templateVersion: 1,
        defaultLocale: 'ar',
        localizations: { create: { locale: 'ar', fullName: 'سالم الهنائي' } },
        links: {
          create: {
            type: 'phone',
            value: '+96891234567',
            position: 0,
            isVisible: true,
            isPrimary: true,
          },
        },
      },
    });

    cardA = card.id;
  });

  it('مؤسسة أخرى لا ترى البطاقة', async () => {
    const seen = await asOrganization(orgB.organizationId, (tx) =>
      tx.card.findMany({ where: { id: cardA } }),
    );

    expect(seen).toHaveLength(0);
  });

  it('مؤسسة أخرى لا تعدّل البطاقة', async () => {
    const result = await asOrganization(orgB.organizationId, (tx) =>
      tx.card.updateMany({ where: { id: cardA }, data: { status: 'published' } }),
    );

    expect(result.count).toBe(0);

    const unchanged = await admin.card.findUnique({ where: { id: cardA } });
    expect(unchanged?.status).toBe('draft');
  });

  it('مؤسسة أخرى لا تحذف البطاقة', async () => {
    const result = await asOrganization(orgB.organizationId, (tx) =>
      tx.card.deleteMany({ where: { id: cardA } }),
    );

    expect(result.count).toBe(0);
    expect(await admin.card.count({ where: { id: cardA } })).toBe(1);
  });

  it('محتوى البطاقة معزول رغم أن جدوله بلا organization_id', async () => {
    const seen = await asOrganization(orgB.organizationId, (tx) =>
      tx.cardLocalization.findMany({ where: { cardId: cardA } }),
    );

    expect(seen).toHaveLength(0);
  });

  it('روابط البطاقة معزولة كذلك', async () => {
    const seen = await asOrganization(orgB.organizationId, (tx) =>
      tx.cardLink.findMany({ where: { cardId: cardA } }),
    );

    expect(seen).toHaveLength(0);
  });

  it('مؤسسة أخرى لا تحقن رابطاً في بطاقة ليست لها', async () => {
    await expect(
      asOrganization(orgB.organizationId, (tx) =>
        tx.cardLink.create({
          data: { cardId: cardA, type: 'phone', value: '+96899999999', position: 9 },
        }),
      ),
    ).rejects.toThrow();

    expect(await admin.cardLink.count({ where: { cardId: cardA } })).toBe(1);
  });

  it('صاحبة البطاقة تراها كاملة', async () => {
    const seen = await asOrganization(orgA.organizationId, (tx) =>
      tx.card.findMany({ where: { id: cardA }, include: { localizations: true, links: true } }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.localizations).toHaveLength(1);
    expect(seen[0]?.links).toHaveLength(1);
  });

  it('بلا سياق مؤسسة لا تُقرأ أي بطاقة', async () => {
    // الحالة الأخطر: استعلام أفلت من ضبط السياق. يجب أن يُرجع لا شيء
    // لا أن يُرجع كل شيء.
    const seen = await app.card.findMany({});

    expect(seen).toHaveLength(0);
  });
});

describe('توفر الرابط عبر المؤسسات', () => {
  beforeEach(async () => {
    await resetData();
  });

  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  it('الرابط المأخوذ في مؤسسة يظهر مأخوذاً لمؤسسة أخرى', async () => {
    const orgA = await createTenant('slug-a');
    await admin.card.create({
      data: {
        organizationId: orgA.organizationId,
        ownerUserId: orgA.userId,
        slug: 'taken-slug',
        templateKey: 'classic',
        templateVersion: 1,
      },
    });

    // الاستعلام العادي محكوم بـRLS فلا يرى صف المؤسسة الأخرى؛ الدالة
    // هي التي تعطي الجواب الصحيح دون كشف أي صف.
    const blind = await app.card.findMany({ where: { slug: 'taken-slug' } });
    expect(blind).toHaveLength(0);

    const rows = await app.$queryRaw<Array<{ taken: boolean }>>`
      SELECT card_slug_taken('taken-slug') AS taken
    `;
    expect(rows[0]?.taken).toBe(true);
  });

  it('الرابط الحر يظهر متاحاً', async () => {
    const rows = await app.$queryRaw<Array<{ taken: boolean }>>`
      SELECT card_slug_taken('free-slug') AS taken
    `;

    expect(rows[0]?.taken).toBe(false);
  });
});

describe('البطاقة العامة', () => {
  let orgA: Awaited<ReturnType<typeof createTenant>>;

  beforeEach(async () => {
    await resetData();
    orgA = await createTenant('public');
  });

  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  async function createCard(slug: string, status: string, publish: boolean) {
    const card = await admin.card.create({
      data: {
        organizationId: orgA.organizationId,
        ownerUserId: orgA.userId,
        slug,
        status,
        templateKey: 'classic',
        templateVersion: 1,
        defaultLocale: 'ar',
        publishedAt: publish ? new Date() : null,
      },
    });

    if (publish) {
      await admin.cardPublication.create({
        data: {
          cardId: card.id,
          revision: 1,
          templateKey: 'classic',
          templateVersion: 1,
          snapshot: { slug, content: { ar: { fullName: 'سالم' } } },
        },
      });
    }

    return card;
  }

  it('تُقرأ اللقطة المنشورة بلا مصادقة وبلا سياق مؤسسة', async () => {
    await createCard('published-card', 'published', true);

    const rows = await app.$queryRaw<Array<{ slug: string; snapshot: unknown }>>`
      SELECT * FROM public_card_by_slug('published-card')
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe('published-card');
  });

  it('لا تُقرأ المسودة', async () => {
    await createCard('draft-card', 'draft', true);

    const rows = await app.$queryRaw`SELECT * FROM public_card_by_slug('draft-card')`;

    expect(rows).toHaveLength(0);
  });

  it('لا تُقرأ البطاقة الملغى نشرها', async () => {
    await createCard('gone-card', 'unpublished', true);

    const rows = await app.$queryRaw`SELECT * FROM public_card_by_slug('gone-card')`;

    expect(rows).toHaveLength(0);
  });

  it('لا تُقرأ البطاقة المحذوفة ناعماً', async () => {
    const card = await createCard('deleted-card', 'published', true);
    await admin.card.update({ where: { id: card.id }, data: { deletedAt: new Date() } });

    const rows = await app.$queryRaw`SELECT * FROM public_card_by_slug('deleted-card')`;

    expect(rows).toHaveLength(0);
  });

  it('تُرجع أحدث نشر لا أوّله', async () => {
    const card = await createCard('latest-card', 'published', true);

    await admin.cardPublication.create({
      data: {
        cardId: card.id,
        revision: 2,
        templateKey: 'classic',
        templateVersion: 1,
        snapshot: { slug: 'latest-card', revision: 2 },
        publishedAt: new Date(Date.now() + 1000),
      },
    });

    const rows = await app.$queryRaw<Array<{ snapshot: { revision?: number } }>>`
      SELECT * FROM public_card_by_slug('latest-card')
    `;

    expect(rows[0]?.snapshot.revision).toBe(2);
  });
});
