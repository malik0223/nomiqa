import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ATTRIBUTION_METRICS,
  type CampaignReport,
  type CampaignSeriesPoint,
  type CampaignSummary,
} from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import {
  CAMPAIGN_REPORT_RANGE_DAYS,
  type CampaignInput,
  type CampaignReportQueryInput,
} from '@nomiqa/validation';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireOwnCard } from './own-card.js';
import { shareUrl } from './share-code.js';
import { withUniqueShareCode } from './share-code-retry.js';

/**
 * الحملات (خارطة الطريق §10.4).
 *
 * لماذا كود مستقل ولا يكفي إلحاق UTM برابط البطاقة: الحملة تُطبع على
 * لافتة معرض أو إعلان، ورابط يحمل خمسة معاملات استعلام لا يُقرأ ولا
 * يُكتب يدوياً ولا يصلح لرمز QR صغير. الكود القصير يحمل المعاملات في
 * الخادم ويضيفها عند التوجيه، فيبقى المطبوع قصيراً والقياس كاملاً.
 *
 * والنافذة الزمنية تحكم **الإسناد لا الوصول**: لافتة معرض انتهى تبقى
 * معلّقة أسابيع، وزائرها يستحق أن يرى البطاقة — ولا يستحق أن يُحسب في
 * أرقام حملة أُغلقت.
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly config: ConfigService,
  ) {}

  async list(organizationId: string): Promise<CampaignSummary[]> {
    const campaigns = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.campaign.findMany({
        orderBy: { createdAt: 'desc' },
        include: { card: { select: { slug: true } } },
      }),
    );

    const now = new Date();
    return campaigns.map((campaign) => this.toSummary(campaign, now));
  }

  async create(
    organizationId: string,
    actorUserId: string,
    input: CampaignInput,
  ): Promise<CampaignSummary> {
    await this.requireFeature(organizationId);

    const campaign = await withUniqueShareCode((code) =>
      withRlsContext(this.prisma, { organizationId }, async (tx) => {
        await requireOwnCard(tx, input.cardId);

        const created = await tx.campaign.create({
          data: {
            organizationId,
            cardId: input.cardId,
            code,
            name: input.name,
            ...utmColumns(input),
            startsAt: input.startsAt ? new Date(input.startsAt) : null,
            endsAt: input.endsAt ? new Date(input.endsAt) : null,
            isActive: input.isActive,
            createdByUserId: actorUserId,
          },
          include: { card: { select: { slug: true } } },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId,
            action: 'presence.campaign_created',
            resourceType: 'campaign',
            resourceId: created.id,
            outcome: 'success',
            metadata: { code, cardId: input.cardId, utmCampaign: input.utmCampaign },
          },
        });

        return created;
      }),
    );

    return this.toSummary(campaign, new Date());
  }

  /**
   * يعدّل حملة.
   *
   * الكود **لا يُعاد توليده هنا ولا في أي مسار آخر**: هو مطبوع على
   * لافتة، وتغييره يبطل كل نسخة منها. تغيير البطاقة الهدف مسموح لأنه
   * لا يمس المطبوع — وهو بالضبط سبب وجود طبقة الإحالة.
   */
  async update(
    organizationId: string,
    actorUserId: string,
    campaignId: string,
    input: CampaignInput,
  ): Promise<CampaignSummary> {
    await this.requireFeature(organizationId);

    const campaign = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const existing = await tx.campaign.findFirst({ where: { id: campaignId } });

      if (!existing) {
        throw new NotFoundException('الحملة غير موجودة');
      }

      await requireOwnCard(tx, input.cardId);

      const updated = await tx.campaign.update({
        where: { id: campaignId },
        data: {
          cardId: input.cardId,
          name: input.name,
          ...utmColumns(input),
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          isActive: input.isActive,
        },
        include: { card: { select: { slug: true } } },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'presence.campaign_updated',
          resourceType: 'campaign',
          resourceId: campaignId,
          outcome: 'success',
          metadata: { code: existing.code, isActive: input.isActive },
        },
      });

      return updated;
    });

    return this.toSummary(campaign, new Date());
  }

  /**
   * يحذف حملة.
   *
   * الأرقام المجمّعة تبقى في `analytics_rollups` ببُعدها المعرّف: حذف
   * الحملة قرار تنظيمي، ومحو ما قِيس فعلاً يعيد كتابة تاريخ حدث.
   * الأرقام اليتيمة لا تظهر في أي شاشة لأن كل قراءة تبدأ من صف الحملة.
   */
  async remove(organizationId: string, actorUserId: string, campaignId: string): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const deleted = await tx.campaign.deleteMany({ where: { id: campaignId } });

      if (deleted.count === 0) {
        throw new NotFoundException('الحملة غير موجودة');
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'presence.campaign_deleted',
          resourceType: 'campaign',
          resourceId: campaignId,
          outcome: 'success',
        },
      });
    });
  }

  /**
   * تقرير أداء حملة.
   *
   * يُقرأ من التجميعات لا من الأحداث الخام: الأحداث تُحذف بعد 90 يوماً
   * بحكم تقليل البيانات، وتقرير حملة انتهت يجب أن يبقى بعدها — وهو
   * السبب المباشر لوجود مقاييس الإسناد في `analytics_rollups`.
   *
   * والزائر الفريد هنا **مجموع الفريد اليومي**، أي تقدير أعلى من
   * الحقيقة لمن زار في أيام متعددة. مقبول لأن مقام معدل التحويل هنا
   * والبسط يخضعان للتقريب نفسه، والاتجاه — وهو ما يُقاس فعلاً — سليم.
   * راجع docs/analytics/definitions.md.
   */
  async report(
    organizationId: string,
    campaignId: string,
    query: CampaignReportQueryInput,
  ): Promise<CampaignReport> {
    const days = CAMPAIGN_REPORT_RANGE_DAYS[query.range];
    const to = new Date();
    const from = startOfUtcDay(new Date(to.getTime() - (days - 1) * 24 * 3_600_000));

    const { campaign, rows, updatedAt } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => {
        const found = await tx.campaign.findFirst({ where: { id: campaignId } });

        if (!found) {
          throw new NotFoundException('الحملة غير موجودة');
        }

        const rollups = await tx.analyticsRollup.findMany({
          where: {
            cardId: found.cardId,
            bucket: 'day',
            bucketStart: { gte: from, lte: to },
            dimension: campaignId,
            metric: {
              in: [
                ATTRIBUTION_METRICS.CAMPAIGN_VIEW,
                ATTRIBUTION_METRICS.CAMPAIGN_UNIQUE,
                ATTRIBUTION_METRICS.CAMPAIGN_FORM_SUBMIT,
              ],
            },
          },
          select: { bucketStart: true, metric: true, count: true },
        });

        const latest = await tx.analyticsRollup.aggregate({
          where: { cardId: found.cardId, bucket: 'day', dimension: campaignId },
          _max: { updatedAt: true },
        });

        return { campaign: found, rows: rollups, updatedAt: latest._max.updatedAt };
      },
    );

    const totals = { views: 0, uniqueVisitors: 0, formSubmits: 0 };
    const byDay = new Map<string, CampaignSeriesPoint>();

    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(from.getTime() + offset * 24 * 3_600_000);
      byDay.set(date.toISOString(), { date: date.toISOString(), views: 0, uniqueVisitors: 0 });
    }

    for (const row of rows) {
      const key = startOfUtcDay(row.bucketStart).toISOString();
      const point = byDay.get(key);

      if (row.metric === ATTRIBUTION_METRICS.CAMPAIGN_VIEW) {
        totals.views += row.count;
        if (point) point.views += row.count;
      } else if (row.metric === ATTRIBUTION_METRICS.CAMPAIGN_UNIQUE) {
        totals.uniqueVisitors += row.count;
        if (point) point.uniqueVisitors += row.count;
      } else {
        totals.formSubmits += row.count;
      }
    }

    return {
      campaignId,
      name: campaign.name,
      range: { from: from.toISOString(), to: to.toISOString() },
      views: totals.views,
      uniqueVisitors: totals.uniqueVisitors,
      formSubmits: totals.formSubmits,
      conversionRate:
        totals.uniqueVisitors === 0
          ? 0
          : Math.round((totals.formSubmits / totals.uniqueVisitors) * 1000) / 10,
      series: [...byDay.values()],
      updatedAt: updatedAt?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------
  // داخلي
  // ---------------------------------------------------------------

  private async requireFeature(organizationId: string): Promise<void> {
    if (!(await this.entitlements.hasFeature(organizationId, 'campaigns'))) {
      throw new ForbiddenException('الحملات غير متاحة في باقتك الحالية');
    }
  }

  private toSummary(campaign: CampaignRow, now: Date): CampaignSummary {
    return {
      id: campaign.id,
      code: campaign.code,
      name: campaign.name,
      cardId: campaign.cardId,
      cardSlug: campaign.card.slug,
      utm: {
        source: campaign.utmSource,
        medium: campaign.utmMedium,
        campaign: campaign.utmCampaign,
        term: campaign.utmTerm,
        content: campaign.utmContent,
      },
      startsAt: campaign.startsAt?.toISOString() ?? null,
      endsAt: campaign.endsAt?.toISOString() ?? null,
      isActive: campaign.isActive,
      isRunning: isRunning(campaign, now),
      shareUrl: shareUrl(
        this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000',
        campaign.code,
      ),
      createdAt: campaign.createdAt.toISOString(),
    };
  }
}

interface CampaignRow {
  id: string;
  code: string;
  name: string;
  cardId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string | null;
  utmContent: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  card: { slug: string };
}

/**
 * نفس شرط النافذة المكتوب في `public_share_target`.
 *
 * تكرار مقصود ومحدود: قاعدة البيانات هي التي تقرر الإسناد لأنها وحدها
 * في مسار الزائر، وهذه النسخة للعرض في الواجهة فقط. أي اختلاف بينهما
 * يظهر كشارة «تعمل الآن» على حملة لا تُسنَد — فليُغيَّرا معاً.
 */
function isRunning(campaign: CampaignRow, now: Date): boolean {
  if (!campaign.isActive) return false;
  if (campaign.startsAt && campaign.startsAt > now) return false;
  if (campaign.endsAt && campaign.endsAt <= now) return false;
  return true;
}

function utmColumns(input: CampaignInput) {
  return {
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    utmTerm: input.utmTerm ?? null,
    utmContent: input.utmContent ?? null,
  };
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
