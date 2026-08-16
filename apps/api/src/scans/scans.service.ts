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
  CONTACT_BASIS_CARD_HANDOVER,
  OUTBOX_EVENT_TYPES,
  QUEUE_NAMES,
  type ExtractedContact,
  type ScanAvailability,
  type ScanExtractionJobData,
  type ScanJobSummary,
} from '@nomiqa/contracts';
import { Prisma, withRlsContext, type TenantScopedClient } from '@nomiqa/database';
import {
  normalizeEmail,
  normalizePhone,
  overallConfidence,
  parseScannedQr,
  type QrScanInput,
  type ScanConfirmInput,
  type ScanCreateInput,
} from '@nomiqa/validation';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { parseQualifiers } from '../events/events.service.js';
import { FilesService } from '../files/files.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

/**
 * مسح البطاقات والشارات (§11.2).
 *
 * ثلاثة ضوابط تحكم كل ما في هذا الملف:
 *
 *  1. **لا صف جهة اتصال من مخرَج آلي.** المسح ينتج `scan_job` في حالة
 *     `review`، ولا يصير جهة اتصال إلا بحمولة يؤكدها إنسان. التعرّف
 *     الضوئي على العربية يخطئ في الأسماء، وصفٌّ خاطئ هنا يعني بريداً
 *     يصل إلى شخص باسم غيره.
 *  2. **لا صف بلا سند حفظ في المعاملة نفسها** — القاعدة 16 في README،
 *     سارية هنا حرفياً. والسند مختلف: `card_handover` لا نص موافقة،
 *     لأن لا نص هناك. التصريح به أصدق من ادعاء موافقة مقروءة.
 *  3. **الصورة تُحذف عند الحسم.** بعد استخراج الحقول لم يبقَ سبب لحفظ
 *     صورة بطاقة شخص لم يسجّل في المنصة — لا للتدقيق ولا للتحسين.
 */
@Injectable()
export class ScansService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScansService.name);
  private queue!: Queue<ScanExtractionJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly files: FilesService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.queue = new Queue<ScanExtractionJobData>(QUEUE_NAMES.SCAN_EXTRACTION, {
      connection: this.redis,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  /** جاهزية المسح — تقرؤها الشاشة قبل أن تعرض زر التصوير. */
  async availability(organizationId: string): Promise<ScanAvailability> {
    const provider = process.env.OCR_PROVIDER ?? 'none';

    return {
      entitled: await this.entitlements.hasFeature(organizationId, 'card_scanning'),
      // بلا محرك مضبوط يبقى المسح متاحاً: الشاشة تعرض نموذجاً فارغاً
      // يملؤه المندوب. أبطأ من الاستخراج وأسرع كثيراً من فتح البطاقات
      // الورقية بعد العودة من المعرض — وهو ما يقع فعلاً حين لا نوفّر
      // مساراً يدوياً.
      ocrConfigured: provider !== 'none',
      provider,
    };
  }

  async list(organizationId: string, userId: string): Promise<ScanJobSummary[]> {
    const jobs = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.scanJob.findMany({
        // مسوحات المستخدم نفسه وحدها: عملية المسح شخصية بطبعها — من
        // صوّر البطاقة هو من يتذكّر صاحبها، ومراجعة الآخرين لمخرَج لا
        // يعرفون سياقه تنتج تصحيحات أسوأ من الخطأ.
        where: { createdByUserId: userId, status: { in: ['pending', 'processing', 'review'] } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );

    return jobs.map(toSummary);
  }

  /**
   * يبدأ مسح صورة.
   *
   * الملف يجب أن يكون مرفوعاً ومؤكَّداً بغرض `scan`: تمرير معرّف ملف
   * بغرض آخر كان يجعل مسار المسح قناةً لقراءة شعار المؤسسة أو مستند
   * رفعه غيرك — كلاهما داخل المؤسسة، وكلاهما ليس ما طُلب.
   */
  async create(
    organizationId: string,
    userId: string,
    input: ScanCreateInput,
  ): Promise<ScanJobSummary> {
    await this.requireFeature(organizationId);

    const job = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const file = await tx.fileObject.findFirst({
        where: { id: input.fileId, deletedAt: null },
        select: { id: true, purpose: true, status: true },
      });

      if (!file || file.purpose !== 'scan' || file.status !== 'uploaded') {
        throw new BadRequestException('الملف غير صالح للمسح');
      }

      if (input.eventId) {
        await this.requireEvent(tx, input.eventId);
      }

      return tx.scanJob.create({
        data: {
          organizationId,
          eventId: input.eventId ?? null,
          fileId: input.fileId,
          kind: input.kind,
          status: 'pending',
          createdByUserId: userId,
        },
      });
    });

    // الإدراج بعد المعاملة لا داخلها: مهمة تشير إلى صفّ لم يُثبَّت بعد
    // قد يلتقطها الـWorker قبل أن يراه — وهو سباق يقع فعلاً تحت الحمل.
    await this.queue.add(
      'extract',
      { scanJobId: job.id, organizationId },
      {
        // ثلاث محاولات بتأجيل أُسّي: فشل المحرك غالباً عابر (حد معدل،
        // انقطاع)، والرابعة لن تنجح حيث فشلت الثالثة.
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: { count: 200 },
      },
    );

    return toSummary(job);
  }

  /**
   * يمسح رمز QR من منصة أخرى.
   *
   * بلا طابور وبلا تخزين: القراءة تمت في المتصفح والنص وصل مُهيكلاً،
   * فالحقول تُستخرج في الطلب نفسه وتصل الشاشة جاهزةً للمراجعة.
   */
  async scanQr(
    organizationId: string,
    userId: string,
    input: QrScanInput,
  ): Promise<ScanJobSummary> {
    await this.requireFeature(organizationId);

    const { extracted, format } = parseScannedQr(input.payload);

    if (Object.keys(extracted).length === 0) {
      throw new BadRequestException('لم نتعرف على بيانات جهة اتصال في هذا الرمز');
    }

    const job = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      if (input.eventId) {
        await this.requireEvent(tx, input.eventId);
      }

      return tx.scanJob.create({
        data: {
          organizationId,
          eventId: input.eventId ?? null,
          kind: 'qr',
          status: 'review',
          extracted: extracted as unknown as Prisma.InputJsonValue,
          confidence: overallConfidence(extracted),
          processedAt: new Date(),
          createdByUserId: userId,
        },
      });
    });

    this.logger.debug(`رمز ممسوح بصيغة ${format}`);
    return toSummary(job);
  }

  /**
   * يحفظ ما راجعه الإنسان جهةَ اتصال.
   *
   * كل ما يُكتب هنا يأتي من `input` لا من `extracted`: الحقل المستخرج
   * وصل الشاشة، وما يعود منها هو ما رآه المراجع — سواء أبقاه أم غيّره.
   * الاعتماد على المخزَّن «لأنه لم يُغيَّر» كان يفتح باب حفظ قيمة لم
   * تُعرض أصلاً حين يتغير شكل الشاشة.
   */
  async confirm(
    organizationId: string,
    userId: string,
    scanId: string,
    input: ScanConfirmInput,
  ): Promise<{ contactId: string; isDuplicate: boolean }> {
    await this.requireFeature(organizationId);

    const emailNormalized = normalizeEmail(input.email ?? undefined);
    const phoneNormalized = normalizePhone(input.phone ?? undefined);

    const result = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const job = await tx.scanJob.findFirst({ where: { id: scanId } });

      if (!job) {
        throw new NotFoundException('عملية المسح غير موجودة');
      }

      if (job.status === 'saved' && job.contactId) {
        // إعادة إرسال من شاشة مفتوحة مرتين: نعيد النتيجة نفسها ولا
        // نكتب صفاً ثانياً. الشبكة في قاعة معرض تجعل هذا شائعاً لا
        // نادراً.
        return { contactId: job.contactId, isDuplicate: false };
      }

      const eventId = input.eventId ?? job.eventId;
      const qualifiers = eventId
        ? await this.validateQualifiers(tx, eventId, input.qualifiers)
        : {};

      const duplicateOfId = await findDuplicate(tx, emailNormalized, phoneNormalized);

      const contact = await tx.contact.create({
        data: {
          organizationId,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          organizationName: input.organizationName ?? null,
          jobTitle: input.jobTitle ?? null,
          source: job.kind === 'badge' ? 'badge' : 'scan',
          locale: 'ar',
          eventId,
          ownerUserId: userId,
          qualifiers:
            Object.keys(qualifiers).length > 0
              ? (qualifiers as Prisma.InputJsonValue)
              : Prisma.DbNull,
          emailNormalized,
          phoneNormalized,
          duplicateOfId,
        },
      });

      // السند في المعاملة نفسها — القاعدة 16، بلا استثناء لمسار المسح.
      await tx.contactConsent.createMany({
        data: [
          {
            organizationId,
            contactId: contact.id,
            purpose: 'contact_storage',
            granted: true,
            consentTextVersion: CONTACT_BASIS_CARD_HANDOVER,
            source: 'scan',
          },
          {
            organizationId,
            contactId: contact.id,
            purpose: 'marketing',
            // تسليم بطاقة ورقية ليس اشتراكاً في قائمة بريدية. القيمة
            // تُسجَّل كما هي — «لم يوافق» إثبات مطلوب تماماً كنقيضه.
            granted: input.marketingConsent,
            consentTextVersion: CONTACT_BASIS_CARD_HANDOVER,
            source: 'scan',
          },
        ],
      });

      await tx.scanJob.update({
        where: { id: scanId },
        data: { status: 'saved', contactId: contact.id, extracted: Prisma.DbNull },
      });

      await tx.outboxEvent.create({
        data: {
          organizationId,
          eventType: OUTBOX_EVENT_TYPES.CONTACT_CAPTURED,
          payload: { contactId: contact.id, ownerUserId: userId, locale: 'ar', source: 'scan' },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'scan.confirmed',
          resourceType: 'contact',
          resourceId: contact.id,
          outcome: 'success',
          // لا اسم ولا بريد: بيانات شخصية ممنوعة في السجلات.
          metadata: { scanId, kind: job.kind, isDuplicate: duplicateOfId !== null, eventId },
        },
      });

      return { contactId: contact.id, isDuplicate: duplicateOfId !== null, fileId: job.fileId };
    });

    await this.deleteImage(organizationId, scanId);
    return { contactId: result.contactId, isDuplicate: result.isDuplicate };
  }

  /** يُهمل مسحاً: الصف يبقى للسجل والصورة تُحذف فوراً. */
  async discard(organizationId: string, userId: string, scanId: string): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const updated = await tx.scanJob.updateMany({
        where: { id: scanId, status: { in: ['pending', 'processing', 'review', 'failed'] } },
        data: { status: 'discarded', extracted: Prisma.DbNull },
      });

      if (updated.count === 0) {
        throw new NotFoundException('عملية المسح غير موجودة');
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'scan.discarded',
          resourceType: 'scan_job',
          resourceId: scanId,
          outcome: 'success',
        },
      });
    });

    await this.deleteImage(organizationId, scanId);
  }

  // ---------------------------------------------------------------
  // داخلي
  // ---------------------------------------------------------------

  private async requireFeature(organizationId: string): Promise<void> {
    if (!(await this.entitlements.hasFeature(organizationId, 'card_scanning'))) {
      throw new ForbiddenException('مسح البطاقات غير متاح في باقتك الحالية');
    }
  }

  private async requireEvent(tx: TenantScopedClient, eventId: string): Promise<void> {
    const event = await tx.event.findFirst({ where: { id: eventId }, select: { id: true } });

    if (!event) {
      throw new NotFoundException('الفعالية غير موجودة');
    }
  }

  /**
   * يقيس القيم على تعريف الفعالية.
   *
   * الاتجاهان مقصودان كما في نموذج البطاقة العام: الحقل المطلوب لا بد
   * أن يصل، والمفتاح غير المعرَّف يُرفض ولا يُتجاهل صامتاً — وإلا صار
   * `qualifiers` حقلاً حراً يكتب فيه العميل ما يشاء عن شخص ثالث.
   */
  private async validateQualifiers(
    tx: TenantScopedClient,
    eventId: string,
    values: Record<string, string>,
  ): Promise<Record<string, string>> {
    const event = await tx.event.findFirst({
      where: { id: eventId },
      select: { qualifiers: true },
    });

    if (!event) {
      throw new NotFoundException('الفعالية غير موجودة');
    }

    const defined = new Map(
      parseQualifiers(event.qualifiers).map((field) => [field.key, field]),
    );
    const details: Array<{ field: string; message: string }> = [];
    const accepted: Record<string, string> = {};

    for (const [key, value] of Object.entries(values)) {
      const field = defined.get(key);

      if (!field) {
        details.push({ field: key, message: 'حقل غير معرّف في هذه الفعالية' });
        continue;
      }

      if (value.trim().length === 0) continue;

      if (field.type === 'select' && !field.options.includes(value)) {
        details.push({ field: key, message: 'قيمة خارج الخيارات المعرّفة' });
        continue;
      }

      accepted[key] = value;
    }

    for (const field of defined.values()) {
      if (field.required && !accepted[field.key]) {
        details.push({ field: field.key, message: 'هذا الحقل مطلوب' });
      }
    }

    if (details.length > 0) {
      throw new BadRequestException({
        code: 'QUALIFIERS_MISMATCH',
        message: 'تعذّر حفظ حقول التأهيل',
        details,
      });
    }

    return accepted;
  }

  /**
   * يحذف صورة المسح.
   *
   * خارج المعاملة عمداً: التخزين نظام آخر لا تشمله، وفشل الحذف فيه لا
   * يجوز أن يُلغي حفظ جهة اتصال أكّدها المستخدم. الفشل يُسجَّل ويلتقطه
   * تنظيف لاحق — والصف موسوم بالوقت الذي كان يجب أن تُحذف فيه.
   */
  private async deleteImage(organizationId: string, scanId: string): Promise<void> {
    const job = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.scanJob.findFirst({ where: { id: scanId }, select: { fileId: true } }),
    );

    if (!job?.fileId) return;

    try {
      await this.files.remove(organizationId, job.fileId);
    } catch (error) {
      this.logger.error(`تعذّر حذف صورة المسح ${scanId}: ${(error as Error).message}`);
      return;
    }

    await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.scanJob.update({
        where: { id: scanId },
        data: { fileId: null, imageDeletedAt: new Date() },
      }),
    );
  }
}

/** أول جهة اتصال تطابق البريد أو الهاتف — **وسم لا منع** (§8.3). */
async function findDuplicate(
  tx: TenantScopedClient,
  emailNormalized: string | null,
  phoneNormalized: string | null,
): Promise<string | null> {
  if (!emailNormalized && !phoneNormalized) return null;

  const match = await tx.contact.findFirst({
    where: {
      deletedAt: null,
      OR: [
        ...(emailNormalized ? [{ emailNormalized }] : []),
        ...(phoneNormalized ? [{ phoneNormalized }] : []),
      ],
    },
    orderBy: { capturedAt: 'asc' },
    select: { id: true, duplicateOfId: true },
  });

  if (!match) return null;
  return match.duplicateOfId ?? match.id;
}

function toSummary(job: {
  id: string;
  kind: string;
  status: string;
  eventId: string | null;
  extracted: unknown;
  confidence: number | null;
  error: string | null;
  contactId: string | null;
  imageDeletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ScanJobSummary {
  return {
    id: job.id,
    kind: job.kind as ScanJobSummary['kind'],
    status: job.status as ScanJobSummary['status'],
    eventId: job.eventId,
    extracted: (job.extracted ?? {}) as ExtractedContact,
    confidence: job.confidence,
    error: job.error,
    contactId: job.contactId,
    imageDeleted: job.imageDeletedAt !== null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

