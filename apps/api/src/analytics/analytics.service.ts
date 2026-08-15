import { Injectable } from '@nestjs/common';
import type {
  AnalyticsCardBreakdown,
  AnalyticsOverview,
  AnalyticsSeriesPoint,
  AnalyticsSummary,
  AnalyticsTopLink,
} from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import { ANALYTICS_RANGE_DAYS, type AnalyticsQueryInput } from '@nomiqa/validation';
import { PrismaService } from '../prisma/prisma.service.js';

interface RollupRow {
  cardId: string;
  bucketStart: Date;
  metric: string;
  dimension: string;
  count: number;
}

const TOP_LINKS_LIMIT = 8;

/**
 * قراءة التحليلات.
 *
 * كل رقم هنا يأتي من مصدرين لا واحد، والاختيار بينهما مقصود:
 *
 *  - **التجميعات** لكل ما يُجمع: المشاهدات والنقرات والتنزيلات. جمع
 *    السلال يعطي المجموع الصحيح دائماً.
 *  - **الأحداث الخام** للزوار الفريدين على مستوى الفترة. جمع الفريد
 *    اليومي عبر ثلاثين يوماً يعدّ الزائر العائد ثلاثين مرة، فيصير
 *    الرقم بلا معنى — وأسوأ من ذلك: **معدل التحويل المبني عليه يصير
 *    أصغر من الحقيقة**، فيرى المستخدم بطاقته أسوأ مما هي.
 *
 * التفصيل الكامل في docs/analytics/definitions.md.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(organizationId: string, query: AnalyticsQueryInput): Promise<AnalyticsOverview> {
    const days = ANALYTICS_RANGE_DAYS[query.range];
    const to = new Date();
    const from = startOfUtcDay(new Date(to.getTime() - (days - 1) * 24 * 3_600_000));

    const cardIds = await this.resolveCardIds(organizationId, query.cardId);

    if (cardIds.length === 0) {
      return {
        range: { from: from.toISOString(), to: to.toISOString() },
        summary: emptySummary(),
        series: buildSeries([], from, days),
        topLinks: [],
        cards: [],
        updatedAt: null,
      };
    }

    const { rollups, uniqueVisitors, formSubmits, updatedAt } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => {
        const rows = await tx.analyticsRollup.findMany({
          where: {
            cardId: { in: cardIds },
            bucket: 'day',
            bucketStart: { gte: from, lte: to },
          },
          select: {
            cardId: true,
            bucketStart: true,
            metric: true,
            dimension: true,
            count: true,
          },
        });

        // الزوار الفريدون للفترة كاملة — من الأحداث الخام لا من جمع
        // الفريد اليومي. راجع تعليق الصنف.
        const distinct = await tx.cardEvent.findMany({
          where: {
            cardId: { in: cardIds },
            type: 'view',
            occurredAt: { gte: from, lte: to },
          },
          distinct: ['visitorHash'],
          select: { visitorHash: true },
        });

        // جهات الاتصال المكتملة تُقرأ من جدولها لا من أحداث النموذج:
        // الحدث يعني «ضُغط زر الإرسال»، والصف يعني «حُفظت جهة اتصال
        // بموافقة». معدل التحويل يجب أن يبنى على الثاني.
        const contacts = await tx.contact.count({
          where: {
            deletedAt: null,
            capturedAt: { gte: from, lte: to },
            ...(query.cardId ? { cardId: query.cardId } : {}),
          },
        });

        const latest = await tx.analyticsRollup.aggregate({
          where: { cardId: { in: cardIds }, bucket: 'day' },
          _max: { updatedAt: true },
        });

        return {
          rollups: rows,
          uniqueVisitors: distinct.length,
          formSubmits: contacts,
          updatedAt: latest._max.updatedAt,
        };
      },
    );

    const summary = buildSummary(rollups, uniqueVisitors, formSubmits);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      summary,
      series: buildSeries(rollups, from, days),
      topLinks: await this.topLinks(organizationId, rollups),
      cards: await this.cardBreakdown(organizationId, rollups, cardIds),
      updatedAt: updatedAt?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------
  // داخلي
  // ---------------------------------------------------------------

  /**
   * البطاقات المشمولة.
   *
   * حتى مع تمرير `cardId` نمر على هذا الاستعلام: التصفية تتحول إلى
   * تحقق من الملكية، فلا يقرأ أحد تحليلات بطاقة مؤسسة أخرى بتمرير
   * معرّفها.
   */
  private async resolveCardIds(organizationId: string, cardId?: string): Promise<string[]> {
    const cards = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.card.findMany({
        where: { deletedAt: null, ...(cardId ? { id: cardId } : {}) },
        select: { id: true },
      }),
    );

    return cards.map((card) => card.id);
  }

  /** أكثر الروابط استخداماً (§8.5)، بأسمائها لا بمعرّفاتها. */
  private async topLinks(
    organizationId: string,
    rollups: RollupRow[],
  ): Promise<AnalyticsTopLink[]> {
    const clicks = new Map<string, number>();

    for (const row of rollups) {
      if (row.metric !== 'link_click' || row.dimension === '') continue;
      clicks.set(row.dimension, (clicks.get(row.dimension) ?? 0) + row.count);
    }

    if (clicks.size === 0) return [];

    const ranked = [...clicks.entries()]
      .sort(([, first], [, second]) => second - first)
      .slice(0, TOP_LINKS_LIMIT);

    const links = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.cardLink.findMany({
        where: { id: { in: ranked.map(([id]) => id) } },
        select: { id: true, type: true, platform: true, label: true, value: true },
      }),
    );

    const byId = new Map(links.map((link) => [link.id, link]));

    // الروابط المحذوفة تُسقط: عرض نقرات على رابط لم يعد موجوداً يثير
    // سؤالاً لا جواب له في الواجهة.
    return ranked.flatMap(([id, count]) => {
      const link = byId.get(id);
      if (!link) return [];

      return [
        {
          linkId: id,
          type: link.type,
          platform: link.platform,
          label: link.label,
          value: link.value,
          clicks: count,
        },
      ];
    });
  }

  private async cardBreakdown(
    organizationId: string,
    rollups: RollupRow[],
    cardIds: string[],
  ): Promise<AnalyticsCardBreakdown[]> {
    const totals = new Map<
      string,
      { views: number; uniqueVisitors: number; formSubmits: number }
    >();

    for (const row of rollups) {
      const entry = totals.get(row.cardId) ?? { views: 0, uniqueVisitors: 0, formSubmits: 0 };

      if (row.metric === 'view') entry.views += row.count;
      // على مستوى البطاقة الواحدة نعرض مجموع الفريد اليومي، وهو تقريب
      // أعلى من الحقيقة. مقبول هنا لأنه رقم مقارنة بين البطاقات لا
      // مقام لمعدل تحويل — راجع وثيقة التعريفات.
      if (row.metric === 'unique_visitor') entry.uniqueVisitors += row.count;
      if (row.metric === 'form_submit') entry.formSubmits += row.count;

      totals.set(row.cardId, entry);
    }

    const cards = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.card.findMany({
        where: { id: { in: cardIds } },
        select: {
          id: true,
          slug: true,
          defaultLocale: true,
          localizations: { select: { locale: true, fullName: true } },
        },
      }),
    );

    return cards
      .map((card): AnalyticsCardBreakdown => {
        const entry = totals.get(card.id) ?? { views: 0, uniqueVisitors: 0, formSubmits: 0 };

        return {
          cardId: card.id,
          slug: card.slug,
          fullName:
            card.localizations.find((entry) => entry.locale === card.defaultLocale)?.fullName ??
            card.localizations[0]?.fullName ??
            card.slug,
          ...entry,
        };
      })
      .sort((first, second) => second.views - first.views);
  }
}

// ---------------------------------------------------------------
// حساب
// ---------------------------------------------------------------

function emptySummary(): AnalyticsSummary {
  return {
    views: 0,
    uniqueVisitors: 0,
    linkClicks: 0,
    vcardDownloads: 0,
    qrScans: 0,
    formViews: 0,
    formSubmits: 0,
    conversionRate: 0,
  };
}

function buildSummary(
  rollups: RollupRow[],
  uniqueVisitors: number,
  formSubmits: number,
): AnalyticsSummary {
  const summary = emptySummary();
  summary.uniqueVisitors = uniqueVisitors;
  summary.formSubmits = formSubmits;

  for (const row of rollups) {
    switch (row.metric) {
      case 'view':
        summary.views += row.count;
        break;
      case 'link_click':
        summary.linkClicks += row.count;
        break;
      case 'vcard_download':
        summary.vcardDownloads += row.count;
        break;
      case 'qr_scan':
        summary.qrScans += row.count;
        break;
      case 'form_view':
        summary.formViews += row.count;
        break;
      default:
        break;
    }
  }

  // المقام هو الزوار الفريدون لا المشاهدات: زائر فتح البطاقة خمس مرات
  // ثم شارك بياناته تحويلٌ واحد ناجح، وقسمته على خمس يعاقب البطاقة
  // على نجاحها في جذب زائر عائد.
  summary.conversionRate =
    uniqueVisitors > 0 ? Math.round((formSubmits / uniqueVisitors) * 1_000) / 10 : 0;

  return summary;
}

/**
 * سلسلة يومية متصلة.
 *
 * الأيام الخالية تُملأ بأصفار: الرسم البياني الذي يتخطى يوماً بلا
 * زيارات يكذب — يجعل الفجوة تبدو استمراراً.
 */
function buildSeries(rollups: RollupRow[], from: Date, days: number): AnalyticsSeriesPoint[] {
  const points = new Map<string, AnalyticsSeriesPoint>();

  for (let index = 0; index < days; index += 1) {
    const date = new Date(from.getTime() + index * 24 * 3_600_000);
    const key = date.toISOString().slice(0, 10);
    points.set(key, {
      date: date.toISOString(),
      views: 0,
      uniqueVisitors: 0,
      linkClicks: 0,
      formSubmits: 0,
    });
  }

  for (const row of rollups) {
    const point = points.get(row.bucketStart.toISOString().slice(0, 10));
    if (!point) continue;

    if (row.metric === 'view') point.views += row.count;
    if (row.metric === 'unique_visitor') point.uniqueVisitors += row.count;
    if (row.metric === 'link_click') point.linkClicks += row.count;
    if (row.metric === 'form_submit') point.formSubmits += row.count;
  }

  return [...points.values()];
}

/** بداية اليوم بالتوقيت العالمي — سلال التجميع مقطوعة بـUTC. */
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
