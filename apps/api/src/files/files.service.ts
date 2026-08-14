import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { withRlsContext } from '@nomiqa/database';
import { filePurposeRules, type UploadRequestInput } from '@nomiqa/validation';
import { extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from './storage.service.js';

export interface UploadTicket {
  fileId: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

const UPLOAD_URL_TTL_SECONDS = 300;
const DOWNLOAD_URL_TTL_SECONDS = 300;

/** امتدادات مسموحة لكل نوع، للتحقق المزدوج مع MIME. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'application/pdf': '.pdf',
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * ينشئ سجل ملف بحالة pending ويعيد رابط رفع موقّعاً.
   *
   * الملف لا يُعتبر موجوداً حتى يؤكَّد الرفع ويُتحقق من الكائن فعلياً
   * في التخزين — فطلب الرابط وحده لا يثبت شيئاً.
   */
  async createUploadTicket(
    organizationId: string,
    userId: string,
    input: UploadRequestInput,
  ): Promise<UploadTicket> {
    const rules = filePurposeRules[input.purpose];

    // إعادة تحقق كاملة في الخادم حتى لو تحقق المتصفح (§4.6).
    if (!rules.mimeTypes.includes(input.mimeType)) {
      throw new BadRequestException('نوع الملف غير مدعوم لهذا الغرض');
    }
    if (input.sizeBytes > rules.maxBytes) {
      throw new BadRequestException('حجم الملف يتجاوز الحد المسموح');
    }

    // الامتداد المعلن يجب أن يوافق الـMIME — لا نثق بأيهما وحده.
    const declaredExtension = extname(input.fileName).toLowerCase();
    const expectedExtension = EXTENSION_BY_MIME[input.mimeType];
    if (
      declaredExtension &&
      expectedExtension &&
      !matchesExtension(declaredExtension, input.mimeType)
    ) {
      throw new BadRequestException('امتداد الملف لا يوافق نوعه');
    }

    // اسم غير متوقع: لا نستخدم اسم المستخدم الأصلي في المسار إطلاقاً،
    // فهو مصدر لمحارف خطرة ولتخمين مسارات ملفات الآخرين (§8).
    const storageKey = `${organizationId}/${input.purpose}/${crypto.randomUUID()}${expectedExtension ?? ''}`;

    const file = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.fileObject.create({
        data: {
          organizationId,
          ownerUserId: userId,
          storageKey,
          purpose: input.purpose,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          originalName: input.fileName.slice(0, 255),
          status: 'pending',
        },
      }),
    );

    const uploadUrl = await this.storage.createUploadUrl(
      storageKey,
      input.mimeType,
      UPLOAD_URL_TTL_SECONDS,
    );

    return { fileId: file.id, uploadUrl, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
  }

  /**
   * يؤكّد الرفع بعد التحقق من وجود الكائن وحجمه الحقيقي.
   *
   * العميل قد يرفع حجماً يخالف ما أعلنه عند طلب الرابط، فنعتمد على
   * ما في التخزين لا على ما ادّعاه.
   */
  async confirmUpload(organizationId: string, fileId: string) {
    const file = await this.findOwned(organizationId, fileId);

    if (file.status === 'uploaded') {
      return file;
    }

    const stored = await this.storage.head(file.storageKey);
    if (!stored) {
      throw new BadRequestException('لم يُعثر على الملف في التخزين — أعد الرفع');
    }

    const rules = filePurposeRules[file.purpose as keyof typeof filePurposeRules];
    if (rules && stored.sizeBytes > rules.maxBytes) {
      // رُفع حجم أكبر مما أُعلن: نحذف الكائن ولا نعتمده.
      await this.storage.delete(file.storageKey);
      await withRlsContext(this.prisma, { organizationId }, (tx) =>
        tx.fileObject.update({ where: { id: fileId }, data: { status: 'rejected' } }),
      );
      throw new BadRequestException('حجم الملف المرفوع يتجاوز الحد المسموح');
    }

    return withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.fileObject.update({
        where: { id: fileId },
        data: {
          status: 'uploaded',
          uploadedAt: new Date(),
          sizeBytes: stored.sizeBytes,
        },
      }),
    );
  }

  async createDownloadUrl(organizationId: string, fileId: string): Promise<string> {
    const file = await this.findOwned(organizationId, fileId);

    if (file.status !== 'uploaded') {
      throw new NotFoundException('الملف غير متاح');
    }

    return this.storage.createDownloadUrl(file.storageKey, DOWNLOAD_URL_TTL_SECONDS);
  }

  /**
   * حذف ناعم في قاعدة البيانات وحذف فعلي من التخزين.
   * ترتيب مقصود: لو فشل حذف التخزين يبقى السجل معلَّماً محذوفاً
   * فلا يظهر للمستخدم، وتلتقطه مهمة تنظيف لاحقة.
   */
  async remove(organizationId: string, fileId: string): Promise<void> {
    const file = await this.findOwned(organizationId, fileId);

    await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.fileObject.update({ where: { id: fileId }, data: { deletedAt: new Date() } }),
    );

    try {
      await this.storage.delete(file.storageKey);
    } catch (error) {
      this.logger.error(`تعذّر حذف الكائن ${file.storageKey}: ${(error as Error).message}`);
    }
  }

  /** يجلب ملفاً ضمن سياق المؤسسة فقط — لا وصول عابر للمؤسسات. */
  private async findOwned(organizationId: string, fileId: string) {
    const file = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.fileObject.findFirst({ where: { id: fileId, deletedAt: null } }),
    );

    if (!file) {
      throw new NotFoundException('الملف غير موجود');
    }

    return file;
  }
}

/** يقبل الامتدادات المكافئة مثل .jpeg و.jpg. */
function matchesExtension(extension: string, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return extension === '.jpg' || extension === '.jpeg';
  }
  return extension === EXTENSION_BY_MIME[mimeType];
}
