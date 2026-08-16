import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { EventStatus, EventSummary, LeadQualifier } from '@nomiqa/contracts';
import { Prisma, withRlsContext, type TenantScopedClient } from '@nomiqa/database';
import type { EventInput } from '@nomiqa/validation';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { requireOwnCard } from '../presence/own-card.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * الفعاليات (خارطة الطريق §11.3).
 *
 * القرار المركزي هنا هو نفسه قرار الحملات في المرحلة 5، مطبَّقاً على
 * وحدة زمنية أطول: **النافذة تحكم الإسناد لا الوصول**. البطاقة المخصصة
 * لمعرض تبقى تعمل بعد إغلاق القاعة — رابطها مطبوع على ما وُزّع فيها —
 * ومن يفتحها بعد شهر ليس من عملاء ذلك المعرض.
 *
 * والتصنيف آلي بالكامل (§11.3): المندوب في القاعة لا يختار الفعالية من
 * قائمة منسدلة. أي حقل يُترك له في تلك اللحظة يُملأ خطأً أو لا يُملأ.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(organizationId: string): Promise<EventSummary[]> {
    const { events, counts } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => ({
        events: await tx.event.findMany({
          orderBy: { startsAt: 'desc' },
          include: { cards: { select: { cardId: true } } },
        }),
        // عدّ واحد مجمَّع لا استعلام لكل فعالية: قائمة بعشرين فعالية
        // كانت ستصير عشرين رحلة إلى قاعدة البيانات لأجل رقم واحد.
        counts: await tx.contact.groupBy({
          by: ['eventId'],
          where: { eventId: { not: null }, deletedAt: null },
          _count: { _all: true },
        }),
      }),
    );

    const leadCounts = new Map(counts.map((row) => [row.eventId, row._count._all]));
    const now = new Date();

    return events.map((event) => toSummary(event, leadCounts.get(event.id) ?? 0, now));
  }

  async create(
    organizationId: string,
    actorUserId: string,
    input: EventInput,
  ): Promise<EventSummary> {
    await this.requireFeature(organizationId);

    const event = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await this.assertCardsOwned(tx, input.cardIds);

      const created = await tx.event.create({
        data: {
          organizationId,
          name: input.name,
          location: input.location ?? null,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          qualifiers: input.qualifiers as unknown as Prisma.InputJsonValue,
          costBaisa: input.costBaisa ?? null,
          targetLeads: input.targetLeads ?? null,
          createdByUserId: actorUserId,
          cards: {
            create: input.cardIds.map((cardId) => ({ cardId, organizationId })),
          },
        },
        include: { cards: { select: { cardId: true } } },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'events.created',
          resourceType: 'event',
          resourceId: created.id,
          outcome: 'success',
          metadata: { cards: input.cardIds.length, qualifiers: input.qualifiers.length },
        },
      });

      return created;
    });

    return toSummary(event, 0, new Date());
  }

  /**
   * يعدّل فعالية.
   *
   * تعديل النافذة الزمنية **لا يعيد تصنيف ما التُقط**: جهة الاتصال
   * تحمل فعاليتها في عمودها منذ لحظة الالتقاط، وإعادة الحساب بأثر رجعي
   * كانت ستنقل عملاء بين تقريرين بعد أن قُرئا واتُّخذ قرار بناءً عليهما.
   * توسيع النافذة يؤثر في القادم وحده — وهو ما يتوقعه من يوسّعها.
   */
  async update(
    organizationId: string,
    actorUserId: string,
    eventId: string,
    input: EventInput,
  ): Promise<EventSummary> {
    await this.requireFeature(organizationId);

    const { event, leadCount } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => {
        const existing = await tx.event.findFirst({ where: { id: eventId } });
        if (!existing) {
          throw new NotFoundException('الفعالية غير موجودة');
        }

        await this.assertCardsOwned(tx, input.cardIds);

        // استبدال كامل لروابط البطاقات: الواجهة ترسل القائمة النهائية،
        // وحساب الفروق في الخادم كان يعني حالتين لنفس النية.
        await tx.eventCard.deleteMany({ where: { eventId } });

        const updated = await tx.event.update({
          where: { id: eventId },
          data: {
            name: input.name,
            location: input.location ?? null,
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            qualifiers: input.qualifiers as unknown as Prisma.InputJsonValue,
            costBaisa: input.costBaisa ?? null,
            targetLeads: input.targetLeads ?? null,
            cards: {
              create: input.cardIds.map((cardId) => ({ cardId, organizationId })),
            },
          },
          include: { cards: { select: { cardId: true } } },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId,
            action: 'events.updated',
            resourceType: 'event',
            resourceId: eventId,
            outcome: 'success',
            metadata: { cards: input.cardIds.length },
          },
        });

        return {
          event: updated,
          leadCount: await tx.contact.count({ where: { eventId, deletedAt: null } }),
        };
      },
    );

    return toSummary(event, leadCount, new Date());
  }

  /**
   * يحذف فعالية.
   *
   * جهات الاتصال تبقى ويصير `event_id` فيها NULL (SET NULL في المهاجرة):
   * حذف الفعالية قرار تنظيمي، ومحو عملاء جمعهم فريق في ثلاثة أيام
   * إتلافٌ لا يعوَّض — ولا يقصده من ضغط «حذف الفعالية».
   */
  async remove(organizationId: string, actorUserId: string, eventId: string): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const deleted = await tx.event.deleteMany({ where: { id: eventId } });

      if (deleted.count === 0) {
        throw new NotFoundException('الفعالية غير موجودة');
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'events.deleted',
          resourceType: 'event',
          resourceId: eventId,
          outcome: 'success',
        },
      });
    });
  }

  /** تعريف حقول التأهيل لفعالية — تقرؤه شاشة المسح قبل عرض النموذج. */
  async qualifiers(organizationId: string, eventId: string): Promise<LeadQualifier[]> {
    const event = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.event.findFirst({ where: { id: eventId }, select: { qualifiers: true } }),
    );

    if (!event) {
      throw new NotFoundException('الفعالية غير موجودة');
    }

    return parseQualifiers(event.qualifiers);
  }

  // ---------------------------------------------------------------
  // داخلي
  // ---------------------------------------------------------------

  private async requireFeature(organizationId: string): Promise<void> {
    if (!(await this.entitlements.hasFeature(organizationId, 'events'))) {
      throw new ForbiddenException('إدارة الفعاليات غير متاحة في باقتك الحالية');
    }
  }

  private async assertCardsOwned(tx: TenantScopedClient, cardIds: string[]): Promise<void> {
    for (const cardId of cardIds) {
      await requireOwnCard(tx, cardId);
    }
  }
}

interface EventRow {
  id: string;
  name: string;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  qualifiers: unknown;
  costBaisa: number | null;
  targetLeads: number | null;
  createdAt: Date;
  cards: Array<{ cardId: string }>;
}

function toSummary(event: EventRow, leadCount: number, now: Date): EventSummary {
  return {
    id: event.id,
    name: event.name,
    location: event.location,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    status: eventStatus(event, now),
    cardIds: event.cards.map((link) => link.cardId),
    qualifiers: parseQualifiers(event.qualifiers),
    costBaisa: event.costBaisa,
    targetLeads: event.targetLeads,
    leadCount,
    createdAt: event.createdAt.toISOString(),
  };
}

/**
 * الحالة محسوبة لا مخزَّنة.
 *
 * عمود «جارية» كان يحتاج مهمة تحدّثه عند حلول الموعد، وأي تأخر فيها
 * يجعل الشاشة تقول «قادمة» عن معرض يقف فيه الفريق الآن.
 */
export function eventStatus(event: { startsAt: Date; endsAt: Date }, now: Date): EventStatus {
  if (event.startsAt > now) return 'upcoming';
  if (event.endsAt < now) return 'ended';
  return 'running';
}

/**
 * يقرأ عمود حقول التأهيل.
 *
 * متساهل عمداً: صفٌّ كُتب بإصدار أقدم من التعريف يجب أن يُعرض لا أن
 * يُسقط التقرير كله. الحقل الذي لا يُفهم يُتجاهل وحده.
 */
export function parseQualifiers(raw: unknown): LeadQualifier[] {
  if (!Array.isArray(raw)) return [];

  const parsed: LeadQualifier[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;

    const source = entry as Record<string, unknown>;
    if (typeof source.key !== 'string' || typeof source.label !== 'string') continue;

    parsed.push({
      key: source.key,
      label: source.label,
      labelEn: typeof source.labelEn === 'string' ? source.labelEn : null,
      type:
        source.type === 'select' || source.type === 'boolean'
          ? source.type
          : 'text',
      options: Array.isArray(source.options)
        ? source.options.filter((option): option is string => typeof option === 'string')
        : [],
      required: source.required === true,
    });
  }

  return parsed;
}
