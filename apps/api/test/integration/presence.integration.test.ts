import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { admin, app, asOrganization, createTenant, disconnectAll, resetData } from './helpers.js';

/**
 * الحضور المهني المتكامل (§10).
 *
 * ثلاثة أشياء لا يمكن اختبارها إلا بقاعدة بيانات حقيقية، وكلها تفشل
 * **بصمت** إن انكسرت:
 *
 *  1. **عقد `analytics_ingest`.** `jsonb_to_recordset` تطابق المفاتيح
 *     بالاسم، فمفتاح بتسمية مختلفة يصير عموداً NULL لا خطأً. الأثر:
 *     فقدان كامل للقياس بلا استثناء واحد في السجلات.
 *  2. **`public_share_target`.** تعمل بلا سياق مؤسسة عبر حدود المؤسسات،
 *     فلا اختبار وحدة يقترب منها.
 *  3. **عزل الجداول الجديدة.** سياسة كُتبت مرة تبقى صحيحة بعد كل
 *     تعديل على المخطط — أو لا تبقى، ولا يخبرنا أحد.
 */
describe('أهداف المشاركة والإسناد', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let cardId: string;
  let slug: string;

  beforeAll(async () => {
    await resetData();
  });

  afterAll(async () => {
    await resetData();
    await disconnectAll();
  });

  beforeEach(async () => {
    await resetData();
    tenant = await createTenant('presence-a');
    other = await createTenant('presence-b');

    slug = `presence-card-${Date.now()}`;
    const card = await admin.card.create({
      data: {
        organizationId: tenant.organizationId,
        ownerUserId: tenant.userId,
        slug,
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
  // عقد الإدراج
  // ---------------------------------------------------------------

  describe('عقد analytics_ingest', () => {
    /**
     * الحارس الوحيد لعقد لا يكسره إلا الصمت.
     *
     * الدالة تعلن أعمدة `AnalyticsIngestEvent` بتهجئتها مقتبسة،
     * والمرحلة 5 أضافت إليها `source` و`campaignCode`. حقل جديد
     * بتهجئة مخالفة يصل NULL ويُسقط الصف بلا خطأ.
     */
    it('يُدرج الحدث بتهجئة العقد نفسها مع حقلي الإسناد', async () => {
      const written = await ingest([row({ source: 'nfc' })]);

      expect(written).toBe(1);

      const events = await admin.cardEvent.findMany({ where: { cardId } });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        visitorHash: 'visitor-1',
        deviceType: 'mobile',
        source: 'nfc',
      });
    });

    it('يُسقط الحدث حين تُرسل المفاتيح بتهجئة snake_case', async () => {
      // توثيق للفشل الصامت: بلا `visitorHash` يصير العمود NULL
      // ويُسقط الصف — بلا خطأ ولا صف مرفوض.
      const written = await ingest([
        {
          slug,
          type: 'view',
          visitor_hash: 'visitor-1',
          occurred_at: new Date().toISOString(),
        },
      ]);

      expect(written).toBe(0);
    });

    it('يرفض مصدراً غير معروف ويقبل الغياب', async () => {
      const rejected = await ingest([row({ source: 'telepathy' })]);
      expect(rejected).toBe(0);

      const accepted = await ingest([row({ source: null })]);
      expect(accepted).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // حل الكود
  // ---------------------------------------------------------------

  describe('public_share_target', () => {
    it('يترجم وسماً نشطاً ويزيد عدّاد مسحه', async () => {
      await admin.nfcTag.create({
        data: {
          organizationId: tenant.organizationId,
          cardId,
          code: 'nfc11111',
          status: 'active',
        },
      });

      const [resolved] = await resolve('nfc11111');
      expect(resolved).toMatchObject({ kind: 'nfc', slug });

      const tag = await admin.nfcTag.findUnique({ where: { code: 'nfc11111' } });
      expect(tag?.scanCount).toBe(1);
      expect(tag?.lastScanAt).not.toBeNull();
    });

    it('لا يترجم وسماً مُبطلاً', async () => {
      await admin.nfcTag.create({
        data: {
          organizationId: tenant.organizationId,
          cardId,
          code: 'nfc22222',
          status: 'revoked',
          revokedAt: new Date(),
        },
      });

      expect(await resolve('nfc22222')).toHaveLength(0);
    });

    it('يعطي حملة داخل نافذتها معاملات UTM كاملة', async () => {
      await createCampaign('camp1111', { endsAt: null });

      const [resolved] = await resolve('camp1111');
      expect(resolved).toMatchObject({
        kind: 'campaign',
        slug,
        utm_source: 'expo',
        utm_campaign: 'gitex25',
      });
    });

    /**
     * القرار المركزي في تصميم الحملات: النافذة تحكم **الإسناد لا
     * الوصول**. اللافتة تبقى معلّقة بعد نهاية الحملة، وزائرها يستحق
     * البطاقة ولا يستحق أن يُحسب في أرقام حملة أُغلقت.
     */
    it('يوصل حملةً منتهيةً إلى البطاقة بلا إسناد', async () => {
      await createCampaign('camp2222', { endsAt: new Date(Date.now() - 86_400_000) });

      const [resolved] = await resolve('camp2222');
      expect(resolved?.slug).toBe(slug);
      expect(resolved?.utm_campaign).toBeNull();
    });

    it('لا يترجم كوداً لبطاقة أُلغي نشرها', async () => {
      await admin.nfcTag.create({
        data: {
          organizationId: tenant.organizationId,
          cardId,
          code: 'nfc33333',
          status: 'active',
        },
      });
      await admin.card.update({ where: { id: cardId }, data: { status: 'unpublished' } });

      expect(await resolve('nfc33333')).toHaveLength(0);
    });

    it('يعطي كوداً مجهولاً نفس نتيجة كود غير قابل للاستخدام', async () => {
      // التمييز بينهما يحوّل المسار إلى أداة تحقق من وجود أكواد بالتخمين.
      expect(await resolve('zzzzzzzz')).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------
  // الإسناد والتجميع
  // ---------------------------------------------------------------

  describe('الإسناد', () => {
    it('يترجم كود الحملة إلى معرّفها داخل الدالة', async () => {
      const campaign = await createCampaign('camp3333', { endsAt: null });

      await ingest([row({ source: 'campaign', campaignCode: 'camp3333' })]);

      const [event] = await admin.cardEvent.findMany({ where: { cardId } });
      expect(event?.campaignId).toBe(campaign.id);
    });

    it('يحفظ الحدث ويُسقط الإسناد وحده حين لا تقابل الكودَ حملة', async () => {
      const written = await ingest([row({ source: 'campaign', campaignCode: 'nosuchco' })]);

      expect(written).toBe(1);
      const [event] = await admin.cardEvent.findMany({ where: { cardId } });
      expect(event?.campaignId).toBeNull();
      expect(event?.source).toBe('campaign');
    });

    it('لا يسند حدثاً إلى حملة بطاقة أخرى', async () => {
      // الحملة مرتبطة ببطاقتها: كود صحيح على بطاقة أخرى لا يُسنَد.
      const otherCard = await admin.card.create({
        data: {
          organizationId: tenant.organizationId,
          ownerUserId: tenant.userId,
          slug: `${slug}-other`,
          status: 'published',
          templateKey: 'classic',
          templateVersion: 1,
          defaultLocale: 'ar',
          publishedAt: new Date(),
        },
      });

      await admin.campaign.create({
        data: {
          organizationId: tenant.organizationId,
          cardId: otherCard.id,
          code: 'camp4444',
          name: 'حملة بطاقة أخرى',
          utmSource: 'expo',
          utmMedium: 'banner',
          utmCampaign: 'gitex25',
        },
      });

      await ingest([row({ source: 'campaign', campaignCode: 'camp4444' })]);

      const [event] = await admin.cardEvent.findMany({ where: { cardId } });
      expect(event?.campaignId).toBeNull();
    });

    it('يجمّع مقاييس الحملة والمصدر في analytics_rollups', async () => {
      const campaign = await createCampaign('camp5555', { endsAt: null });

      await ingest([
        row({ source: 'campaign', campaignCode: 'camp5555', visitorHash: 'v1' }),
        row({ source: 'campaign', campaignCode: 'camp5555', visitorHash: 'v2' }),
        row({ source: 'nfc', visitorHash: 'v3' }),
        row({ source: 'campaign', campaignCode: 'camp5555', visitorHash: 'v1', type: 'form_submit' }),
      ]);

      await admin.$queryRawUnsafe(
        `SELECT analytics_rollup_range('day', now() - interval '1 day', now() + interval '1 hour')`,
      );

      const rollups = await admin.analyticsRollup.findMany({
        where: { cardId, metric: { in: ['campaign_view', 'campaign_unique', 'campaign_form_submit', 'source_view'] } },
      });

      const find = (metric: string, dimension: string) =>
        rollups.find((row) => row.metric === metric && row.dimension === dimension)?.count;

      expect(find('campaign_view', campaign.id)).toBe(2);
      expect(find('campaign_unique', campaign.id)).toBe(2);
      expect(find('campaign_form_submit', campaign.id)).toBe(1);
      expect(find('source_view', 'campaign')).toBe(2);
      expect(find('source_view', 'nfc')).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // العزل
  // ---------------------------------------------------------------

  describe('عزل جداول الحضور', () => {
    it('يمنع مؤسسة من رؤية وسوم غيرها وحملاتها وتوقيعاتها', async () => {
      await admin.nfcTag.create({
        data: { organizationId: tenant.organizationId, cardId, code: 'nfc44444', status: 'active' },
      });
      await createCampaign('camp6666', { endsAt: null });
      await admin.signatureProfile.create({
        data: { cardId, organizationId: tenant.organizationId, templateKey: 'classic', options: {} },
      });
      await admin.walletPass.create({
        data: {
          organizationId: tenant.organizationId,
          cardId,
          platform: 'apple',
          serialNumber: `serial-${Date.now()}`,
          authToken: 'secret-token',
        },
      });

      const mine = await asOrganization(tenant.organizationId, async (tx) => ({
        tags: await tx.nfcTag.count(),
        campaigns: await tx.campaign.count(),
        profiles: await tx.signatureProfile.count(),
        passes: await tx.walletPass.count(),
      }));

      expect(mine).toEqual({ tags: 1, campaigns: 1, profiles: 1, passes: 1 });

      const theirs = await asOrganization(other.organizationId, async (tx) => ({
        tags: await tx.nfcTag.count(),
        campaigns: await tx.campaign.count(),
        profiles: await tx.signatureProfile.count(),
        passes: await tx.walletPass.count(),
      }));

      expect(theirs).toEqual({ tags: 0, campaigns: 0, profiles: 0, passes: 0 });
    });

    it('يمنع الكتابة في مؤسسة أخرى حتى بتمرير معرّفها صراحةً', async () => {
      await expect(
        asOrganization(other.organizationId, (tx) =>
          tx.nfcTag.create({
            data: {
              organizationId: tenant.organizationId,
              code: 'nfc55555',
              status: 'unassigned',
            },
          }),
        ),
      ).rejects.toThrow();
    });

    it('يحجب الوسوم تماماً بلا سياق مؤسسة', async () => {
      await admin.nfcTag.create({
        data: { organizationId: tenant.organizationId, cardId, code: 'nfc66666', status: 'active' },
      });

      expect(await app.nfcTag.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // أدوات
  // ---------------------------------------------------------------

  function row(overrides: Record<string, unknown> = {}) {
    return {
      slug,
      type: 'view',
      linkId: null,
      visitorHash: 'visitor-1',
      locale: 'ar',
      referrerHost: null,
      deviceType: 'mobile',
      source: 'nfc',
      campaignCode: null,
      occurredAt: new Date().toISOString(),
      ...overrides,
    };
  }

  async function ingest(events: unknown[]): Promise<number> {
    const rows = await admin.$queryRawUnsafe<Array<{ analytics_ingest: number }>>(
      `SELECT analytics_ingest($1::jsonb)`,
      JSON.stringify(events),
    );

    return rows[0]?.analytics_ingest ?? 0;
  }

  async function resolve(code: string) {
    return admin.$queryRawUnsafe<
      Array<{ kind: string; slug: string; utm_source: string | null; utm_campaign: string | null }>
    >(`SELECT * FROM public_share_target($1)`, code);
  }

  async function createCampaign(code: string, options: { endsAt: Date | null }) {
    return admin.campaign.create({
      data: {
        organizationId: tenant.organizationId,
        cardId,
        code,
        name: 'حملة اختبار',
        utmSource: 'expo',
        utmMedium: 'banner',
        utmCampaign: 'gitex25',
        endsAt: options.endsAt,
      },
    });
  }
});
