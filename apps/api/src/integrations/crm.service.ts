import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CrmConnectionStatus,
  CrmConnectionSummary,
  CrmOwnerStrategy,
  CrmProvider,
  CrmSyncLogEntry,
  CrmSyncStatus,
  CrmSyncableField,
} from '@nomiqa/contracts';
import { Prisma, withRlsContext } from '@nomiqa/database';
import type { CrmConnectionInput, CrmRetryInput } from '@nomiqa/validation';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * وصلات CRM (§11.5).
 *
 * قواعد المزامنة الأربع، وكلها مكتوبة في الجداول لا في الشيفرة:
 *
 *  1. **اتجاه واحد**: منّا إليهم. الاتجاه الثاني يحتاج قراراً في من
 *     يفوز عند التعارض، ولا يُتخذ قبل رؤية استخدام حقيقي.
 *  2. **لا تكرار**: صف `crm_sync_logs` فريد على (وصلة، جهة اتصال) —
 *     هو نفسه مانع التكرار لا فحصٌ يسبقه.
 *  3. **إعادة المحاولة مؤجَّلة أُسّياً**: الفشل غالباً حد معدل أو
 *     انقطاع، وإعادة فورية تضاعف الضغط على نظام يتعافى.
 *  4. **السجل يبقى**: كل عملية لها صف بحالتها وسببها — «سجل واضح لكل
 *     عملية تصدير أو مزامنة» هو بوابة خروج هذه المرحلة نصّاً.
 *
 * ورمز الوصول **لا يغادر الخادم**: لا يُعاد في أي استجابة، ولا يظهر
 * في سجل تدقيق، ولا يدخل رسالة خطأ.
 */
@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(organizationId: string): Promise<CrmConnectionSummary[]> {
    const { connections, counts } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => ({
        connections: await tx.crmConnection.findMany({ orderBy: { createdAt: 'desc' } }),
        counts: await tx.crmSyncLog.groupBy({
          by: ['connectionId', 'status'],
          _count: { _all: true },
        }),
      }),
    );

    return connections.map((connection) => {
      const rows = counts.filter((row) => row.connectionId === connection.id);
      const countOf = (status: string) =>
        rows.find((row) => row.status === status)?._count._all ?? 0;

      return {
        id: connection.id,
        provider: connection.provider as CrmProvider,
        status: connection.status as CrmConnectionStatus,
        fieldMap: parseFieldMap(connection.fieldMap),
        ownerStrategy: connection.ownerStrategy as CrmOwnerStrategy,
        ownerRef: connection.ownerRef,
        marketingConsentOnly: connection.marketingConsentOnly,
        lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
        lastError: connection.lastError,
        pending: countOf('pending'),
        failed: countOf('failed'),
        createdAt: connection.createdAt.toISOString(),
      };
    });
  }

  /**
   * ينشئ وصلة أو يعدّلها.
   *
   * مسار واحد للاثنين لأن الفريد على (مؤسسة، مزوّد) يجعلهما عملية
   * واحدة فعلاً: «اربط HubSpot» مرتين ليست وصلتين بل تصحيحاً للأولى.
   *
   * والرمز يُكتب فقط حين يصل: تعديل خريطة الحقول لا يجوز أن يمحو رمزاً
   * صالحاً لأن الشاشة لم تُعِد إرساله — وهي لا تستطيع، فهو لا يُقرأ.
   */
  async upsert(
    organizationId: string,
    actorUserId: string,
    input: CrmConnectionInput,
  ): Promise<CrmConnectionSummary> {
    await this.requireFeature(organizationId);

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const existing = await tx.crmConnection.findFirst({
        where: { provider: input.provider },
        select: { id: true },
      });

      if (!existing && !input.accessToken) {
        throw new BadRequestException('رمز الوصول مطلوب عند إنشاء الوصلة');
      }

      const data = {
        fieldMap: input.fieldMap as Prisma.InputJsonValue,
        ownerStrategy: input.ownerStrategy,
        ownerRef: input.ownerRef ?? null,
        marketingConsentOnly: input.marketingConsentOnly,
        status: input.status,
        ...(input.accessToken
          ? // رمز جديد يمسح آخر خطأ: من لصق رمزاً جديداً يعالج غالباً
            // خطأ مصادقة، وإبقاء الرسالة القديمة يجعل الشاشة تتهم
            // إعداداً صُحّح للتو.
            { accessToken: input.accessToken, lastError: null }
          : {}),
      };

      if (existing) {
        await tx.crmConnection.update({ where: { id: existing.id }, data });
      } else {
        await tx.crmConnection.create({
          data: {
            organizationId,
            provider: input.provider,
            accessToken: input.accessToken!,
            createdByUserId: actorUserId,
            ...data,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: existing ? 'integrations.crm_updated' : 'integrations.crm_connected',
          resourceType: 'crm_connection',
          resourceId: existing?.id ?? null,
          outcome: 'success',
          // لا رمز ولا جزء منه — سرّ طرف ثالث لا يدخل سجلاً.
          metadata: {
            provider: input.provider,
            ownerStrategy: input.ownerStrategy,
            tokenRotated: Boolean(input.accessToken),
          },
        },
      });
    });

    const connections = await this.list(organizationId);
    return connections.find((connection) => connection.provider === input.provider)!;
  }

  async disconnect(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
  ): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const deleted = await tx.crmConnection.deleteMany({ where: { id: connectionId } });

      if (deleted.count === 0) {
        throw new NotFoundException('الوصلة غير موجودة');
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'integrations.crm_disconnected',
          resourceType: 'crm_connection',
          resourceId: connectionId,
          outcome: 'success',
        },
      });
    });
  }

  async logs(organizationId: string, connectionId: string): Promise<CrmSyncLogEntry[]> {
    const logs = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const connection = await tx.crmConnection.findFirst({
        where: { id: connectionId },
        select: { id: true },
      });

      if (!connection) {
        throw new NotFoundException('الوصلة غير موجودة');
      }

      return tx.crmSyncLog.findMany({
        where: { connectionId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { contact: { select: { fullName: true } } },
      });
    });

    return logs.map((log) => ({
      id: log.id,
      contactId: log.contactId,
      contactName: log.contact.fullName,
      status: log.status as CrmSyncStatus,
      operation: log.operation,
      remoteId: log.remoteId,
      attempts: log.attempts,
      error: log.error,
      nextAttemptAt: log.nextAttemptAt?.toISOString() ?? null,
      syncedAt: log.syncedAt?.toISOString() ?? null,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  /**
   * يعيد جدولة ما فشل.
   *
   * لا يُعيد الإرسال هنا: يصفّر التأجيل ويعيد الحالة `pending` فيلتقطه
   * الـWorker. الإرسال داخل طلب المستخدم كان يجعل زرّ «أعد المحاولة»
   * ينتظر مئة نداء شبكي إلى نظام بطيء ثم ينتهي بمهلة.
   */
  async retry(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
    input: CrmRetryInput,
  ): Promise<{ requeued: number }> {
    const requeued = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const updated = await tx.crmSyncLog.updateMany({
        where: { id: { in: input.logIds }, connectionId, status: 'failed' },
        data: { status: 'pending', nextAttemptAt: new Date(), error: null },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'integrations.crm_retried',
          resourceType: 'crm_connection',
          resourceId: connectionId,
          outcome: 'success',
          metadata: { requested: input.logIds.length, requeued: updated.count },
        },
      });

      return updated.count;
    });

    return { requeued };
  }

  /**
   * يجدول مزامنة كاملة.
   *
   * صفوف `pending` لكل جهة اتصال لم تُزامَن بعد. `createMany` مع
   * `skipDuplicates` يستند إلى الفريد على (وصلة، جهة اتصال): تشغيلها
   * مرتين لا يضاعف شيئاً، وهو ما يجعل الزر آمناً للضغط مرتين — وسيُضغط.
   */
  async syncAll(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
  ): Promise<{ queued: number }> {
    await this.requireFeature(organizationId);

    const queued = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const connection = await tx.crmConnection.findFirst({ where: { id: connectionId } });

      if (!connection) {
        throw new NotFoundException('الوصلة غير موجودة');
      }

      const contacts = await tx.contact.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });

      const created = await tx.crmSyncLog.createMany({
        data: contacts.map((contact) => ({
          organizationId,
          connectionId,
          contactId: contact.id,
          status: 'pending',
          nextAttemptAt: new Date(),
        })),
        skipDuplicates: true,
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'integrations.crm_sync_all',
          resourceType: 'crm_connection',
          resourceId: connectionId,
          outcome: 'success',
          metadata: { queued: created.count },
        },
      });

      return created.count;
    });

    return { queued };
  }

  private async requireFeature(organizationId: string): Promise<void> {
    if (!(await this.entitlements.hasFeature(organizationId, 'crm_sync'))) {
      throw new ForbiddenException('مزامنة CRM غير متاحة في باقتك الحالية');
    }
  }
}

/** يقرأ خريطة الحقول متجاهلاً ما لا يطابق القائمة المغلقة. */
function parseFieldMap(raw: unknown): Partial<Record<CrmSyncableField, string>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }

  const map: Partial<Record<CrmSyncableField, string>> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 0) {
      map[key as CrmSyncableField] = value;
    }
  }

  return map;
}
