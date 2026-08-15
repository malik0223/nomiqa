import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
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
  private publicBucket!: string;
  private publicBaseUrl!: string;

  onModuleInit(): void {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('إعدادات S3 ناقصة: S3_ENDPOINT و S3_BUCKET والمفاتيح مطلوبة');
    }

    this.bucket = bucket;
    // دلو منفصل للوسائط المنشورة. الفصل مقصود: صلاحية القراءة العامة
    // خاصية للدلو كله، فوضع ملفات المؤسسات الخاصة فيه يجعل خطأً واحداً
    // في سياسة الدلو تسريباً شاملاً.
    this.publicBucket = process.env.S3_PUBLIC_BUCKET ?? `${bucket}-public`;
    this.publicBaseUrl = (
      process.env.S3_PUBLIC_BASE_URL ?? `${endpoint.replace(/\/+$/, '')}/${this.publicBucket}`
    ).replace(/\/+$/, '');
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

  // ============================================================
  // الوسائط المنشورة
  //
  // صورة على بطاقة منشورة **محتوى عام بالتعريف**: الصفحة تُفتح بلا
  // تسجيل وتُخزَّن مؤقتاً على CDN. رابط موقّع قصير العمر لا يصلح لها —
  // ينتهي بعد دقائق بينما الصفحة المخزَّنة تبقى، فتنكسر الصور.
  //
  // لذلك: نسخة من الصورة تُوضع في دلو عام عند النشر، والأصل يبقى في
  // الدلو الخاص. القاعدة «لا ملفات عامة» تبقى سارية على كل ما لم
  // يقرر صاحبه نشره صراحة.
  // ============================================================

  /** ينسخ كائناً من الدلو الخاص إلى الدلو العام ويعيد رابطه الدائم. */
  async publishObject(sourceKey: string, publicKey: string, mimeType?: string): Promise<string> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.publicBucket,
        // المصدر يُكتب كـ<bucket>/<key> ويجب ترميزه: مفاتيحنا UUID
        // لكن الترميز يبقى صحيحاً لأي مفتاح مستقبلي.
        CopySource: encodeURI(`${this.bucket}/${sourceKey}`),
        Key: publicKey,
        ...(mimeType ? { ContentType: mimeType, MetadataDirective: 'REPLACE' as const } : {}),
        // سنة كاملة: المفتاح يتغير حين تتغير الصورة، فلا حاجة لإبطال.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return this.publicUrl(publicKey);
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  /** مفاتيح الكائنات العامة تحت بادئة — لتنظيف ما لم يعد منشوراً. */
  async listPublicKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.publicBucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of result.Contents ?? []) {
        if (object.Key) keys.push(object.Key);
      }

      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
  }

  async deletePublicKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    // حد S3 ألف مفتاح لكل طلب؛ بطاقة واحدة أقل من ذلك بكثير،
    // لكن التقسيم يمنع فشلاً صامتاً لو تراكمت النسخ.
    for (let index = 0; index < keys.length; index += 1000) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.publicBucket,
          Delete: { Objects: keys.slice(index, index + 1000).map((Key) => ({ Key })) },
        }),
      );
    }

    this.logger.log(`حُذف ${keys.length} كائناً عاماً`);
  }
}
