import { Injectable, NotFoundException } from '@nestjs/common';
import { OUTBOX_EVENT_TYPES, type Paginated } from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import {
  normalizeEmail,
  normalizePhone,
  type ExternalContactInput,
  type ExternalContactsQueryInput,
} from '@nomiqa/validation';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * منطق الـAPI العام (§11.4).
 *
 * ما يُرجَع هنا **عقد منشور** لا شكل داخلي: عملاء يكتبون شيفرةً عليه
 * ولا يقرؤون تغييراتنا. لذلك حقول صريحة محدودة لا تمرير لصف قاعدة
 * البيانات — عمود يُضاف غداً لا يجوز أن يظهر في تكامل عميل بلا قرار.
 */
@Injectable()
export class PublicApiService {
  constructor(private readonly prisma: PrismaService) {}

  async contacts(
    organizationId: string,
    query: ExternalContactsQueryInput,
  ): Promise<Paginated<ExternalContact>> {
    const where = {
      deletedAt: null,
      ...(query.since ? { capturedAt: { gt: new Date(query.since) } } : {}),
      ...(query.eventId ? { eventId: query.eventId } : {}),
    };

    const { rows, total } = await withRlsContext(this.prisma, { organizationId }, async (tx) => ({
      rows: await tx.contact.findMany({
        where,
        // تصاعدي بوقت الالتقاط: المزامنة التزايدية تمرّر آخر ما رأته
        // في `since`، وترتيب تنازلي كان يجعلها تفقد كل ما بينهما عند
        // أول صفحة ثانية.
        orderBy: { capturedAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          organizationName: true,
          jobTitle: true,
          source: true,
          eventId: true,
          qualifiers: true,
          duplicateOfId: true,
          capturedAt: true,
        },
      }),
      total: await tx.contact.count({ where }),
    }));

    return {
      data: rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        organizationName: row.organizationName,
        jobTitle: row.jobTitle,
        source: row.source,
        eventId: row.eventId,
        qualifiers: (row.qualifiers ?? {}) as Record<string, string>,
        isDuplicate: row.duplicateOfId !== null,
        capturedAt: row.capturedAt.toISOString(),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  /**
   * ينشئ جهة اتصال من نظام خارجي.
   *
   * السند يصل من المرسِل ويُخزَّن كما هو في `consentTextVersion`.
   * السبب: **نحن لا نعرف كيف حصل ذلك النظام على البيانات**. اختراع
   * سند من عندنا يعني توقيعاً على إقرار لا نملك ما يسنده، وتركه
   * فارغاً يعني صفّ بيانات شخصية بلا سند — وهو ما تمنعه القاعدة 16.
   */
  async createContact(
    organizationId: string,
    input: ExternalContactInput,
  ): Promise<{ id: string; isDuplicate: boolean }> {
    const emailNormalized = normalizeEmail(input.email ?? undefined);
    const phoneNormalized = normalizePhone(input.phone ?? undefined);

    return withRlsContext(this.prisma, { organizationId }, async (tx) => {
      if (input.eventId) {
        const event = await tx.event.findFirst({
          where: { id: input.eventId },
          select: { id: true },
        });

        if (!event) {
          throw new NotFoundException('الفعالية غير موجودة');
        }
      }

      const duplicate =
        emailNormalized || phoneNormalized
          ? await tx.contact.findFirst({
              where: {
                deletedAt: null,
                OR: [
                  ...(emailNormalized ? [{ emailNormalized }] : []),
                  ...(phoneNormalized ? [{ phoneNormalized }] : []),
                ],
              },
              orderBy: { capturedAt: 'asc' },
              select: { id: true, duplicateOfId: true },
            })
          : null;

      const duplicateOfId = duplicate ? (duplicate.duplicateOfId ?? duplicate.id) : null;

      const contact = await tx.contact.create({
        data: {
          organizationId,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          organizationName: input.organizationName ?? null,
          jobTitle: input.jobTitle ?? null,
          source: 'import',
          eventId: input.eventId ?? null,
          emailNormalized,
          phoneNormalized,
          duplicateOfId,
        },
      });

      await tx.contactConsent.createMany({
        data: [
          {
            organizationId,
            contactId: contact.id,
            purpose: 'contact_storage',
            granted: true,
            consentTextVersion: input.consent.basis.slice(0, 120),
            source: 'import',
          },
          {
            organizationId,
            contactId: contact.id,
            purpose: 'marketing',
            granted: input.consent.marketing,
            consentTextVersion: input.consent.basis.slice(0, 120),
            source: 'import',
          },
        ],
      });

      await tx.outboxEvent.create({
        data: {
          organizationId,
          eventType: OUTBOX_EVENT_TYPES.CONTACT_CAPTURED,
          payload: { contactId: contact.id, locale: 'ar', source: 'api' },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: null,
          action: 'integrations.contact_created',
          resourceType: 'contact',
          resourceId: contact.id,
          outcome: 'success',
          metadata: { source: 'api', isDuplicate: duplicateOfId !== null },
        },
      });

      return { id: contact.id, isDuplicate: duplicateOfId !== null };
    });
  }

  async events(organizationId: string): Promise<ExternalEvent[]> {
    const { events, counts } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => ({
        events: await tx.event.findMany({ orderBy: { startsAt: 'desc' }, take: 100 }),
        counts: await tx.contact.groupBy({
          by: ['eventId'],
          where: { eventId: { not: null }, deletedAt: null },
          _count: { _all: true },
        }),
      }),
    );

    const leadCounts = new Map(counts.map((row) => [row.eventId, row._count._all]));

    return events.map((event) => ({
      id: event.id,
      name: event.name,
      location: event.location,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      leadCount: leadCounts.get(event.id) ?? 0,
    }));
  }
}

/** شكل جهة الاتصال في العقد المنشور. */
export interface ExternalContact {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  jobTitle: string | null;
  source: string;
  eventId: string | null;
  qualifiers: Record<string, string>;
  isDuplicate: boolean;
  capturedAt: string;
}

export interface ExternalEvent {
  id: string;
  name: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  leadCount: number;
}
