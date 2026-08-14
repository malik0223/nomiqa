import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StoredObjectInfo {
  sizeBytes: number;
  mimeType: string | undefined;
}

/**
 * غلاف رقيق حول تخزين متوافق مع S3.
 *
 * كل التعامل مع الملفات يمر من هنا حتى يبقى استبدال المزوّد ممكناً
 * (وثيقة المعمارية §2.2: عدم الارتباط بمزوّد سحابي واحد).
 *
 * المبدأ الحاكم: **الملفات الخاصة لا تُقدَّم عبر التطبيق ولا تكون
 * عامة**. العميل يرفع وينزّل مباشرة من التخزين بروابط موقّعة قصيرة
 * العمر، فلا يمر الحمل الثنائي عبر الـAPI.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private bucket!: string;

  onModuleInit(): void {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('إعدادات S3 ناقصة: S3_ENDPOINT و S3_BUCKET والمفاتيح مطلوبة');
    }

    this.bucket = bucket;
    this.client = new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
      // MinIO وأغلب البدائل تتطلب مسارات بدل النطاقات الفرعية.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    });
  }

  /**
   * رابط رفع موقّع. العمر قصير عمداً: الرابط يمنح قدرة الكتابة،
   * فكل ثانية إضافية توسّع نافذة إساءة الاستخدام.
   */
  async createUploadUrl(key: string, mimeType: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** رابط تنزيل موقّع للملفات الخاصة. */
  async createDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * يقرأ بيانات الكائن من التخزين.
   *
   * تُستخدم للتحقق من الرفع فعلياً: العميل قد يدّعي إتمامه دون رفع،
   * أو يرفع حجماً مخالفاً لما أعلنه عند طلب الرابط.
   */
  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        sizeBytes: result.ContentLength ?? 0,
        mimeType: result.ContentType,
      };
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NotFound' || name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`حُذف الكائن ${key}`);
  }
}
