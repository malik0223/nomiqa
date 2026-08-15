import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ContactConsentData,
  ContactConsentPurpose,
  ContactDetail,
  ContactFollowUpStatus,
  ContactNoteData,
  ContactSource,
  ContactStats,
  ContactSummary,
  FollowUpTaskData,
  FollowUpTaskStatus,
  Paginated,
  TagData,
} from '@nomiqa/contracts';
import { Prisma, withRlsContext } from '@nomiqa/database';
import {
  normalizeEmail,
  normalizePhone,
  type ContactCreateInput,
  type ContactNoteInput,
  type ContactQueryInput,
  type ContactUpdateInput,
  type FollowUpTaskInput,
  type TagInput,
} from '@nomiqa/validation';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildContactsCsv } from './contact-csv.js';

/** سقف التصدير في طلب واحد — يحمي الذاكرة من مؤسسة بمئات الآلاف. */
const EXPORT_LIMIT = 5_000;

const CONTACT_INCLUDE = {
  card: { select: { slug: true } },
  tags: { include: { tag: true } },
  _count: { select: { notes: true } },
} satisfies Prisma.ContactInclude;

type ContactRow = Prisma.ContactGetPayload<{ include: typeof CONTACT_INCLUDE }>;

/**
 * إدارة جهات الاتصال.
 *
 * كل استعلام هنا يمر بـ`withRlsContext` بمعرّف المؤسسة. ليس احتياطاً
 * زائداً: هذه بيانات أشخاص لم يسجّلوا في المنصة ولا يعرفون بوجودها،
 * فتسريبها بين مؤسستين خرق يخص من لا يستطيع أن يشتكي منه.
 */
@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // قراءة
  // ---------------------------------------------------------------

  async list(
    organizationId: string,
    query: ContactQueryInput,
  ): Promise<Paginated<ContactSummary>> {
    const where = buildWhere(query);

    const { rows, total } = await withRlsContext(this.prisma, { organizationId }, async (tx) => ({
      rows: await tx.contact.findMany({
        where,
        include: CONTACT_INCLUDE,
        orderBy: { capturedAt: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      total: await tx.contact.count({ where }),
    }));

    return {
      data: rows.map(toSummary),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async get(organizationId: string, contactId: string): Promise<ContactDetail> {
    const contact = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.contact.findFirst({
        where: { id: contactId, deletedAt: null },
        include: {
          ...CONTACT_INCLUDE,
          notes: { orderBy: { createdAt: 'desc' } },
          followUps: { orderBy: { dueAt: 'asc' } },
          consents: { orderBy: { createdAt: 'desc' } },
        },
      }),
    );

    if (!contact) {
      throw new NotFoundException('جهة الاتصال غير موجودة');
    }

    const authorNames = await this.resolveAuthorNames(
      contact.notes.map((note) => note.authorUserId),
    );

    return {
      ...toSummary(contact),
      message: contact.message,
      locale: contact.locale,
      customFields: parseCustomFields(contact.customFields),
      duplicateOfId: contact.duplicateOfId,
      notes: contact.notes.map(
        (note): ContactNoteData => ({
          id: note.id,
          body: note.body,
          authorUserId: note.authorUserId,
          authorName: note.authorUserId ? (authorNames.get(note.authorUserId) ?? null) : null,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
        }),
      ),
      followUps: contact.followUps.map(toFollowUp),
      consents: contact.consents.map(
        (consent): ContactConsentData => ({
          id: consent.id,
          purpose: consent.purpose as ContactConsentPurpose,
          granted: consent.granted,
          consentTextVersion: consent.consentTextVersion,
          source: consent.source,
          createdAt: consent.createdAt.toISOString(),
        }),
      ),
      updatedAt: contact.updatedAt.toISOString(),
    };
  }

  /**
   * ملخص القائمة.
   *
   * أعداد لا صفوف: يظهر في أعلى الصفحة وفي لوحة المستخدم، وجلب
   * الصفوف لعدّها في المتصفح يحمّل الشبكة ببيانات شخصية بلا داع.
   */
  async stats(organizationId: string): Promise<ContactStats> {
    const now = new Date();
    const days = (count: number) => new Date(now.getTime() - count * 24 * 3_600_000);

    return withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const base = { deletedAt: null };

      const [total, newCount, inProgress, dueFollowUps, last7Days, last30Days] = await Promise.all([
        tx.contact.count({ where: base }),
        tx.contact.count({ where: { ...base, followUpStatus: 'new' } }),
        tx.contact.count({ where: { ...base, followUpStatus: 'in_progress' } }),
        tx.followUpTask.count({ where: { status: 'open', dueAt: { lte: now } } }),
        tx.contact.count({ where: { ...base, capturedAt: { gte: days(7) } } }),
        tx.contact.count({ where: { ...base, capturedAt: { gte: days(30) } } }),
      ]);

      return { total, new: newCount, inProgress, dueFollowUps, last7Days, last30Days };
    });
  }

  /** أحدث جهات الاتصال — للوحة المستخدم (§8.5). */
  async recent(organizationId: string, limit: number): Promise<ContactSummary[]> {
    const rows = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.contact.findMany({
        where: { deletedAt: null },
        include: CONTACT_INCLUDE,
        orderBy: { capturedAt: 'desc' },
        take: limit,
      }),
    );

    return rows.map(toSummary);
  }

  /**
   * ملف CSV بنفس تصفية القائمة.
   *
   * التصدير يخضع لـ`contacts:export` لا `contacts:read`: قراءة صفحة
   * على الشاشة شيء، وإخراج آلاف الصفوف من بيانات أطراف ثالثة في ملف
   * يغادر المنصة شيء آخر — ويُسجَّل في سجل التدقيق لذلك.
   */
  async exportCsv(
    organizationId: string,
    userId: string,
    query: ContactQueryInput,
  ): Promise<string> {
    const where = buildWhere(query);

    const rows = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const contacts = await tx.contact.findMany({
        where,
        include: CONTACT_INCLUDE,
        orderBy: { capturedAt: query.order },
        take: EXPORT_LIMIT,
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'contacts.exported',
          resourceType: 'contact',
          outcome: 'success',
          // العدد لا المحتوى — السجل يثبت أن تصديراً حدث وحجمه.
          metadata: { count: contacts.length, filtered: Object.keys(where).length > 1 },
        },
      });

      return contacts;
    });

    return buildContactsCsv(
      rows.map((row) => ({
        ...toSummary(row),
        message: row.message,
        customFields: parseCustomFields(row.customFields),
      })),
    );
  }

  // ---------------------------------------------------------------
  // كتابة
  // ---------------------------------------------------------------

  /**
   * إدخال يدوي.
   *
   * بلا صف موافقة عمداً: الموافقة تُسجَّل حين يمنحها صاحب البيانات
   * بنفسه في النموذج العام. تسجيل «موافقة» نيابةً عن شخص أدخله موظف
   * يدوياً يزوّر سنداً، والأساس القانوني هنا مختلف ويُوثَّق في سجل
   * المعالجة لا في جدول الموافقات.
   */
  async create(
    organizationId: string,
    userId: string,
    input: ContactCreateInput,
  ): Promise<ContactDetail> {
    if (input.cardId) {
      await this.requireCard(organizationId, input.cardId);
    }

    const tagIds = await this.requireTags(organizationId, input.tagIds);

    const contact = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const created = await tx.contact.create({
        data: {
          organizationId,
          cardId: input.cardId ?? null,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          organizationName: input.organizationName ?? null,
          jobTitle: input.jobTitle ?? null,
          message: input.message ?? null,
          source: 'manual',
          emailNormalized: normalizeEmail(input.email),
          phoneNormalized: normalizePhone(input.phone),
        },
      });

      if (tagIds.length > 0) {
        await tx.contactTag.createMany({
          data: tagIds.map((tagId) => ({ contactId: created.id, tagId })),
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'contact.created',
          resourceType: 'contact',
          resourceId: created.id,
          outcome: 'success',
          metadata: { source: 'manual' },
        },
      });

      return created;
    });

    return this.get(organizationId, contact.id);
  }

  async update(
    organizationId: string,
    userId: string,
    contactId: string,
    input: ContactUpdateInput,
  ): Promise<ContactDetail> {
    await this.requireContact(organizationId, contactId);

    const tagIds =
      input.tagIds !== undefined ? await this.requireTags(organizationId, input.tagIds) : null;

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await tx.contact.updateMany({
        where: { id: contactId, deletedAt: null },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.email !== undefined
            ? { email: input.email, emailNormalized: normalizeEmail(input.email) }
            : {}),
          ...(input.phone !== undefined
            ? { phone: input.phone, phoneNormalized: normalizePhone(input.phone) }
            : {}),
          ...(input.organizationName !== undefined
            ? { organizationName: input.organizationName }
            : {}),
          ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
          ...(input.followUpStatus !== undefined ? { followUpStatus: input.followUpStatus } : {}),
          ...(input.followUpAt !== undefined
            ? { followUpAt: input.followUpAt ? new Date(input.followUpAt) : null }
            : {}),
        },
      });

      if (tagIds !== null) {
        // استبدال كامل: الواجهة ترسل الحالة النهائية للتصنيفات،
        // والدمج الجزئي يجعل إزالة تصنيف عملية لا يمكن التعبير عنها.
        await tx.contactTag.deleteMany({ where: { contactId } });
        if (tagIds.length > 0) {
          await tx.contactTag.createMany({
            data: tagIds.map((tagId) => ({ contactId, tagId })),
          });
        }
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'contact.updated',
          resourceType: 'contact',
          resourceId: contactId,
          outcome: 'success',
          // أسماء الحقول لا قيمها.
          metadata: { fields: Object.keys(input) },
        },
      });
    });

    return this.get(organizationId, contactId);
  }

  /**
   * حذف ناعم.
   *
   * الصف يبقى لأن سجل الموافقة معلّق به: حذفه صلباً يمحو إثبات أننا
   * حفظنا البيانات بموافقة. الحذف الصلب يأتي عبر طلب صاحب البيانات
   * أو سياسة الاحتفاظ، لا عبر زر في القائمة.
   */
  async remove(organizationId: string, userId: string, contactId: string): Promise<void> {
    await this.requireContact(organizationId, contactId);

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await tx.contact.updateMany({
        where: { id: contactId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'contact.deleted',
          resourceType: 'contact',
          resourceId: contactId,
          outcome: 'success',
        },
      });
    });
  }

  // ---------------------------------------------------------------
  // الملاحظات
  // ---------------------------------------------------------------

  async addNote(
    organizationId: string,
    userId: string,
    contactId: string,
    input: ContactNoteInput,
  ): Promise<ContactNoteData> {
    await this.requireContact(organizationId, contactId);

    const note = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.contactNote.create({
        data: { organizationId, contactId, authorUserId: userId, body: input.body },
      }),
    );

    const names = await this.resolveAuthorNames([userId]);

    return {
      id: note.id,
      body: note.body,
      authorUserId: note.authorUserId,
      authorName: names.get(userId) ?? null,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }

  async removeNote(organizationId: string, contactId: string, noteId: string): Promise<void> {
    const deleted = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.contactNote.deleteMany({ where: { id: noteId, contactId } }),
    );

    if (deleted.count === 0) {
      throw new NotFoundException('الملاحظة غير موجودة');
    }
  }

  // ---------------------------------------------------------------
  // التصنيفات
  // ---------------------------------------------------------------

  async listTags(organizationId: string): Promise<TagData[]> {
    const tags = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.tag.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { contacts: true } } },
      }),
    );

    return tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      contactCount: tag._count.contacts,
    }));
  }

  async createTag(organizationId: string, input: TagInput): Promise<TagData> {
    try {
      const tag = await withRlsContext(this.prisma, { organizationId }, (tx) =>
        tx.tag.create({
          data: { organizationId, name: input.name, color: input.color ?? null },
        }),
      );

      return { id: tag.id, name: tag.name, color: tag.color, contactCount: 0 };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('يوجد تصنيف بهذا الاسم');
      }
      throw error;
    }
  }

  async updateTag(organizationId: string, tagId: string, input: TagInput): Promise<TagData> {
    try {
      const updated = await withRlsContext(this.prisma, { organizationId }, (tx) =>
        tx.tag.updateMany({
          where: { id: tagId },
          data: { name: input.name, color: input.color ?? null },
        }),
      );

      if (updated.count === 0) {
        throw new NotFoundException('التصنيف غير موجود');
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('يوجد تصنيف بهذا الاسم');
      }
      throw error;
    }

    const tags = await this.listTags(organizationId);
    const tag = tags.find((entry) => entry.id === tagId);
    if (!tag) {
      throw new NotFoundException('التصنيف غير موجود');
    }
    return tag;
  }

  async removeTag(organizationId: string, tagId: string): Promise<void> {
    const deleted = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.tag.deleteMany({ where: { id: tagId } }),
    );

    if (deleted.count === 0) {
      throw new NotFoundException('التصنيف غير موجود');
    }
  }

  // ---------------------------------------------------------------
  // تذكيرات المتابعة
  // ---------------------------------------------------------------

  async addFollowUp(
    organizationId: string,
    contactId: string,
    input: FollowUpTaskInput,
  ): Promise<FollowUpTaskData> {
    await this.requireContact(organizationId, contactId);

    const task = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.followUpTask.create({
        data: {
          organizationId,
          contactId,
          assignedUserId: input.assignedUserId ?? null,
          title: input.title,
          dueAt: new Date(input.dueAt),
        },
      }),
    );

    return toFollowUp(task);
  }

  async setFollowUpStatus(
    organizationId: string,
    contactId: string,
    taskId: string,
    status: FollowUpTaskStatus,
  ): Promise<FollowUpTaskData> {
    const task = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const updated = await tx.followUpTask.updateMany({
        where: { id: taskId, contactId },
        data: { status, completedAt: status === 'done' ? new Date() : null },
      });

      if (updated.count === 0) {
        throw new NotFoundException('التذكير غير موجود');
      }

      return tx.followUpTask.findFirst({ where: { id: taskId, contactId } });
    });

    if (!task) {
      throw new NotFoundException('التذكير غير موجود');
    }

    return toFollowUp(task);
  }

  // ---------------------------------------------------------------
  // داخلي
  // ---------------------------------------------------------------

  private async requireContact(organizationId: string, contactId: string): Promise<void> {
    const found = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.contact.findFirst({ where: { id: contactId, deletedAt: null }, select: { id: true } }),
    );

    if (!found) {
      throw new NotFoundException('جهة الاتصال غير موجودة');
    }
  }

  private async requireCard(organizationId: string, cardId: string): Promise<void> {
    const found = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.card.findFirst({ where: { id: cardId, deletedAt: null }, select: { id: true } }),
    );

    // 400 لا 404: من منظور المستخدم قيمة مرفوضة في نموذج، والتفريق
    // بين «غير موجودة» و«ليست لك» يكشف وجود بطاقات مؤسسات أخرى.
    if (!found) {
      throw new BadRequestException('بطاقة غير صالحة');
    }
  }

  /** يتحقق أن كل تصنيف يخص هذه المؤسسة قبل ربطه. */
  private async requireTags(organizationId: string, tagIds: string[]): Promise<string[]> {
    if (tagIds.length === 0) return [];

    const unique = [...new Set(tagIds)];
    const found = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.tag.findMany({ where: { id: { in: unique } }, select: { id: true } }),
    );

    if (found.length !== unique.length) {
      throw new BadRequestException('تصنيف غير صالح');
    }

    return found.map((tag) => tag.id);
  }

  /**
   * أسماء كتّاب الملاحظات.
   *
   * جدول `users` عابر للمؤسسات فلا يمر بسياق RLS. نقصر الاستعلام على
   * المعرّفات المذكورة في الملاحظات ونُرجع الاسم وحده — لا بريد ولا
   * أي حقل آخر يخص مستخدماً قد لا يكون عضواً في هذه المؤسسة اليوم.
   */
  private async resolveAuthorNames(
    ids: Array<string | null>,
  ): Promise<Map<string, string | null>> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) return new Map();

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true },
    });

    return new Map(users.map((user) => [user.id, user.fullName]));
  }
}

// ---------------------------------------------------------------
// تحويلات
// ---------------------------------------------------------------

function buildWhere(query: ContactQueryInput): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { deletedAt: null };

  if (query.cardId) where.cardId = query.cardId;
  if (query.status) where.followUpStatus = query.status;
  if (query.source) where.source = query.source;
  if (query.tagId) where.tags = { some: { tagId: query.tagId } };

  if (query.duplicates === 'only') where.duplicateOfId = { not: null };
  if (query.duplicates === 'exclude') where.duplicateOfId = null;

  if (query.from || query.to) {
    where.capturedAt = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
  }

  if (query.search) {
    // البحث يشمل ما يتذكره المستخدم فعلاً بعد اللقاء: الاسم، جهة
    // العمل، أو جزءاً من رقم أو بريد.
    const contains = { contains: query.search, mode: 'insensitive' as const };
    where.OR = [
      { fullName: contains },
      { email: contains },
      { phone: contains },
      { organizationName: contains },
      { jobTitle: contains },
    ];
  }

  return where;
}

function toSummary(contact: ContactRow): ContactSummary {
  return {
    id: contact.id,
    fullName: contact.fullName,
    email: contact.email,
    phone: contact.phone,
    organizationName: contact.organizationName,
    jobTitle: contact.jobTitle,
    source: contact.source as ContactSource,
    followUpStatus: contact.followUpStatus as ContactFollowUpStatus,
    followUpAt: contact.followUpAt?.toISOString() ?? null,
    cardId: contact.cardId,
    cardSlug: contact.card?.slug ?? null,
    tags: contact.tags.map((link) => ({
      id: link.tag.id,
      name: link.tag.name,
      color: link.tag.color,
    })),
    isDuplicate: contact.duplicateOfId !== null,
    noteCount: contact._count.notes,
    capturedAt: contact.capturedAt.toISOString(),
  };
}

function toFollowUp(task: {
  id: string;
  title: string;
  dueAt: Date;
  status: string;
  assignedUserId: string | null;
  completedAt: Date | null;
  createdAt: Date;
}): FollowUpTaskData {
  return {
    id: task.id,
    title: task.title,
    dueAt: task.dueAt.toISOString(),
    status: task.status as FollowUpTaskStatus,
    assignedUserId: task.assignedUserId,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  };
}

/** قيم الحقول المخصصة المخزَّنة JSON حر؛ نقبل النصوص فقط. */
function parseCustomFields(value: Prisma.JsonValue | null): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry;
  }
  return result;
}
