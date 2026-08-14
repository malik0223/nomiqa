import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@nomiqa/database';

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    });
  }
  return client;
}

/**
 * يحذف كل كائنات مؤسسة من التخزين.
 *
 * حذف الصفوف وحده لا يحذف الملفات: البيانات الثنائية تعيش في نظام
 * منفصل، وتركها يعني بقاء صور شخصية ومستندات بعد تنفيذ طلب الحذف —
 * وهو إخلال بالطلب لا مجرد إهدار مساحة.
 */
export async function deleteStorageObjects(
  prisma: PrismaClient,
  organizationId: string,
): Promise<number> {
  const files = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return tx.fileObject.findMany({
      where: { organizationId },
      select: { storageKey: true },
    });
  });

  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error('S3_BUCKET مطلوب لحذف الملفات');
  }

  let deleted = 0;

  for (const file of files) {
    try {
      await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: file.storageKey }));
      deleted += 1;
    } catch (error) {
      const name = (error as { name?: string }).name;
      // الكائن غير موجود أصلاً — الغاية محققة، نواصل.
      if (name !== 'NoSuchKey' && name !== 'NotFound') {
        throw error;
      }
      deleted += 1;
    }
  }

  return deleted;
}
