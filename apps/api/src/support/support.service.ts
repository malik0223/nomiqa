import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  TicketCategory,
  TicketDetail,
  TicketPriority,
  TicketStatus,
  TicketSummary,
} from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import type { CreateTicketInput } from '@nomiqa/validation';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * تذاكر الدعم — جانب العميل (خارطة الطريق §9.5).
 *
 * الرسائل الداخلية تُصفّى هنا لا في الواجهة: ملاحظة يكتبها فريق المنصة
 * لنفسه عن حساب عميل يجب ألا تغادر الخادم أصلاً، ولا يُعتمد على مكوّن
 * واجهة يتذكر إخفاءها.
 */
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<TicketSummary[]> {
    const tickets = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.supportTicket.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: { _count: { select: { messages: true } } },
      }),
    );

    return tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category as TicketCategory,
      priority: ticket.priority as TicketPriority,
      status: ticket.status as TicketStatus,
      messageCount: ticket._count.messages,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    }));
  }

  async get(organizationId: string, ticketId: string): Promise<TicketDetail> {
    const ticket = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.supportTicket.findFirst({
        where: { id: ticketId },
        include: {
          messages: { where: { isInternal: false }, orderBy: { createdAt: 'asc' } },
          _count: { select: { messages: true } },
        },
      }),
    );

    if (!ticket) {
      throw new NotFoundException('التذكرة غير موجودة');
    }

    const authorNames = await this.authorNames(
      ticket.messages.map((message) => message.authorUserId),
    );

    return {
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category as TicketCategory,
      priority: ticket.priority as TicketPriority,
      status: ticket.status as TicketStatus,
      messageCount: ticket._count.messages,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      messages: ticket.messages.map((message) => ({
        id: message.id,
        authorType: message.authorType as 'customer' | 'platform',
        authorName:
          message.authorType === 'platform'
            ? 'فريق نمِقة'
            : (authorNames.get(message.authorUserId ?? '') ?? null),
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  async create(
    organizationId: string,
    actorUserId: string,
    input: CreateTicketInput,
  ): Promise<{ id: string }> {
    const created = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.supportTicket.create({
        data: {
          organizationId,
          createdByUserId: actorUserId,
          subject: input.subject,
          category: input.category,
          priority: input.priority,
          status: 'pending_platform',
          messages: {
            create: {
              organizationId,
              authorUserId: actorUserId,
              authorType: 'customer',
              body: input.body,
            },
          },
        },
      }),
    );

    return { id: created.id };
  }

  /**
   * رد العميل.
   *
   * يعيد فتح تذكرة أُغلقت خلال أسبوع بدل إجبار العميل على فتح تذكرة
   * جديدة تفقد سياق المحادثة. الأقدم من ذلك يبقى مغلقاً.
   */
  async reply(
    organizationId: string,
    actorUserId: string,
    ticketId: string,
    body: string,
  ): Promise<void> {
    const ticket = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.supportTicket.findFirst({ where: { id: ticketId } }),
    );

    if (!ticket) {
      throw new NotFoundException('التذكرة غير موجودة');
    }

    const REOPEN_WINDOW_MS = 7 * 24 * 3_600_000;
    const closedLongAgo =
      ticket.status === 'closed' &&
      ticket.closedAt !== null &&
      Date.now() - ticket.closedAt.getTime() > REOPEN_WINDOW_MS;

    if (closedLongAgo) {
      throw new ConflictException('التذكرة مغلقة — افتح تذكرة جديدة');
    }

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await tx.supportMessage.create({
        data: {
          organizationId,
          ticketId,
          authorUserId: actorUserId,
          authorType: 'customer',
          body,
        },
      });

      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'pending_platform', closedAt: null, resolvedAt: null },
      });
    });
  }

  /** يغلق العميل تذكرته. لا يُتاح له وسمها «محلولة» — ذاك قرار الفريق. */
  async close(organizationId: string, ticketId: string): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const updated = await tx.supportTicket.updateMany({
        where: { id: ticketId, status: { not: 'closed' } },
        data: { status: 'closed', closedAt: new Date() },
      });

      if (updated.count === 0) {
        throw new NotFoundException('التذكرة غير موجودة أو مغلقة');
      }
    });
  }

  private async authorNames(userIds: Array<string | null>): Promise<Map<string, string | null>> {
    const ids = [...new Set(userIds.filter((id): id is string => id !== null))];

    if (ids.length === 0) {
      return new Map();
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });

    return new Map(users.map((user) => [user.id, user.fullName]));
  }
}
