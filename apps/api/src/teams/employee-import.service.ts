import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  QUEUE_NAMES,
  type EmployeeImportJobData,
  type EmployeeImportSummary,
  type ImportRowError,
  type ImportStatus,
} from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import type { EmployeeImportOptionsInput } from '@nomiqa/validation';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { ImportFormatError, parseEmployeeCsv } from './employee-csv.js';

/**
 * الاستيراد الجماعي للموظفين (خارطة الطريق §9.2).
 *
 * الطلب يحلّل الملف ويرفض الواضح خطؤه فوراً، ثم يُسلّم الباقي إلى
 * الطابور. الفصل مقصود: مسؤول يرفع ملفاً بخمسمئة موظف يجب أن يعرف
 * خلال ثانية أن ملفه مقروء، لا أن ينتظر إنشاء خمسمئة دعوة في طلب
 * واحد قد ينقطع في منتصفه.
 *
 * الملف **لا يُخزَّن**: يُحلَّل في الذاكرة وتُمرَّر صفوفه إلى المهمة.
 * ملف الموارد البشرية بيانات شخصية كاملة، وإبقاؤه في التخزين يضيف
 * نسخةً دائمة لا يحتاجها أحد بعد تنفيذ الدفعة.
 */
@Injectable()
export class EmployeeImportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmployeeImportService.name);
  private queue!: Queue<EmployeeImportJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.queue = new Queue<EmployeeImportJobData>(QUEUE_NAMES.EMPLOYEE_IMPORT, {
      connection: this.redis,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  async start(
    organizationId: string,
    actorUserId: string,
    options: EmployeeImportOptionsInput,
    content: string,
  ): Promise<EmployeeImportSummary> {
    if (!(await this.entitlements.hasFeature(organizationId, 'csv_import'))) {
      throw new ForbiddenException('الاستيراد الجماعي متاح في باقة الفرق والشركات وما فوقها');
    }

    let parsed;
    try {
      parsed = parseEmployeeCsv(content);
    } catch (error) {
      if (error instanceof ImportFormatError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    if (parsed.rows.length === 0) {
      throw new BadRequestException('لا يوجد صف صالح في الملف');
    }

    // الحد يُفحص قبل الإدراج في الطابور: دفعةٌ تعرف مسبقاً أنها لن
    // تكتمل يجب أن تُرفض بينما المستخدم ينتظر، لا أن تفشل نصفها لاحقاً.
    const quota = await this.entitlements.quota(organizationId, 'maxMembers');
    if (quota.limit >= 0 && quota.used + parsed.rows.length > quota.limit) {
      throw new ForbiddenException(
        `الملف يحتوي ${parsed.rows.length} موظفاً، والمتبقي في باقتك ${Math.max(0, quota.limit - quota.used)} مقعداً.`,
      );
    }

    const record = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.employeeImport.create({
        data: {
          organizationId,
          createdByUserId: actorUserId,
          fileName: options.fileName,
          status: 'pending',
          createCards: options.createCards,
          sendInvites: options.sendInvites,
          totalRows: parsed.totalRows,
          errorCount: parsed.errors.length,
          rowErrors: parsed.errors as never,
        },
      }),
    );

    await this.queue.add(
      'import',
      {
        importId: record.id,
        organizationId,
        actorUserId,
        rows: parsed.rows,
      },
      {
        // معرّف المهمة = معرّف الدفعة: إعادة إرسال الطلب نفسه لا تُنشئ
        // دفعتين تتسابقان على البريد نفسه.
        jobId: `import:${record.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    );

    this.logger.log(`بدأت دفعة استيراد ${record.id} بـ${parsed.rows.length} صفاً`);

    return toSummary(record);
  }

  async list(organizationId: string): Promise<EmployeeImportSummary[]> {
    const records = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.employeeImport.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    );

    return records.map(toSummary);
  }

  async get(organizationId: string, importId: string): Promise<EmployeeImportSummary> {
    const record = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.employeeImport.findFirst({ where: { id: importId } }),
    );

    if (!record) {
      throw new NotFoundException('دفعة الاستيراد غير موجودة');
    }

    return toSummary(record);
  }
}

interface ImportRecord {
  id: string;
  fileName: string;
  status: string;
  createCards: boolean;
  sendInvites: boolean;
  totalRows: number;
  invitedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  rowErrors: unknown;
  failureReason: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

function toSummary(record: ImportRecord): EmployeeImportSummary {
  return {
    id: record.id,
    fileName: record.fileName,
    status: record.status as ImportStatus,
    createCards: record.createCards,
    sendInvites: record.sendInvites,
    totalRows: record.totalRows,
    invitedCount: record.invitedCount,
    updatedCount: record.updatedCount,
    skippedCount: record.skippedCount,
    errorCount: record.errorCount,
    rowErrors: Array.isArray(record.rowErrors) ? (record.rowErrors as ImportRowError[]) : [],
    failureReason: record.failureReason,
    createdAt: record.createdAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null,
  };
}
