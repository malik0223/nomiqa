import type { ExtractedContact, ScanExtractionJobData } from '@nomiqa/contracts';
import { getPrismaClient, withRlsContext, type Prisma } from '@nomiqa/database';
import { createLogger } from '@nomiqa/observability';
import { overallConfidence, parseBusinessCard } from '@nomiqa/validation';
import type { Job } from 'bullmq';
import { OcrUnavailableError, getOcrProvider, readStoredImage } from './ocr-provider.js';

const prisma = getPrismaClient();
const logger = createLogger('scans');

/**
 * استخراج بيانات بطاقة ممسوحة (§11.2).
 *
 * المعالج **لا يكتب جهة اتصال**: يحوّل الصف من `pending` إلى `review`
 * ويعلّق الحقول المستخرجة عليه. الكتابة تقع في الـAPI بعد أن يؤكد
 * إنسان ما قرأه المحرك.
 *
 * Idempotent: صفٌّ حُسم (`saved` أو `discarded`) يُتخطى، وإعادة تشغيل
 * المهمة على صف في `review` تعيد كتابة الحقول نفسها. إعادة المحاولة
 * مضمونة الحدوث — القاعدة 8 في README.
 *
 * **لا نص خام يُخزَّن.** ما يقرؤه المحرك يحمل كل ما على البطاقة: عنوان
 * البيت أحياناً، ورقم حساب أحياناً. نأخذ الحقول الستة ونُسقط الباقي في
 * الذاكرة، فلا يبقى ما لم نطلبه.
 */
export async function handleScanExtraction(job: Job<ScanExtractionJobData>): Promise<void> {
  const { scanJobId, organizationId } = job.data;

  const scan = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.scanJob.findFirst({
      where: { id: scanJobId },
      select: { id: true, status: true, fileId: true },
    }),
  );

  if (!scan) {
    // حُذف الصف قبل المعالجة — ليس فشلاً، فلا نعيد المحاولة.
    logger.warn({ scanJobId }, 'عملية المسح غير موجودة — تُتخطى');
    return;
  }

  if (scan.status !== 'pending' && scan.status !== 'processing') {
    logger.debug({ scanJobId, status: scan.status }, 'المسح محسوم — يُتخطى');
    return;
  }

  if (!scan.fileId) {
    await fail(organizationId, scanJobId, 'الصورة غير متاحة');
    return;
  }

  const file = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.fileObject.findFirst({
      where: { id: scan.fileId!, deletedAt: null },
      select: { storageKey: true, mimeType: true },
    }),
  );

  if (!file) {
    await fail(organizationId, scanJobId, 'الصورة حُذفت قبل الاستخراج');
    return;
  }

  await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.scanJob.update({ where: { id: scanJobId }, data: { status: 'processing' } }),
  );

  let text: string;

  try {
    const image = await readStoredImage(file.storageKey);
    const result = await getOcrProvider().recognize(image, file.mimeType);
    text = result.text;
  } catch (error) {
    if (error instanceof OcrUnavailableError) {
      // حالة إعداد لا فشل عابر: نضع الصف في المراجعة بحقول فارغة
      // فيملؤها المندوب بنفسه. إعادة المحاولة كانت ستشغل الطابور
      // بما لن ينجح حتى يتغير الإعداد.
      await review(organizationId, scanJobId, {}, 0);
      logger.warn({ scanJobId }, 'لا محرك تعرّف مضبوط — مراجعة يدوية');
      return;
    }

    // خطأ عابر: نتركه يرتفع فيعيد BullMQ المحاولة. الوسم بالفشل عند
    // أول تعثّر كان يجعل انقطاعاً لثانيتين يُهدر بطاقة صوّرها مندوب
    // في قاعة ولن يعود إلى صاحبها ليصورها ثانية.
    throw error;
  }

  const extracted = parseBusinessCard(text);

  if (Object.keys(extracted).length === 0) {
    await review(organizationId, scanJobId, {}, 0);
    logger.info({ scanJobId }, 'لم يُستخرج أي حقل — مراجعة يدوية');
    return;
  }

  await review(organizationId, scanJobId, extracted, overallConfidence(extracted));
  logger.info({ scanJobId, fields: Object.keys(extracted).length }, 'اكتمل الاستخراج');
}

/**
 * فشل مستنفَد للمحاولات.
 *
 * يُستدعى من `main.ts` عند استنفاد المحاولات: صفٌّ يبقى `processing`
 * إلى الأبد يظهر في شاشة المندوب دوّاراً لا ينتهي، بلا رسالة ولا
 * إمكانية إدخال يدوي.
 */
export async function handleScanExtractionFailure(
  job: Job<ScanExtractionJobData>,
  error: Error,
): Promise<void> {
  await fail(job.data.organizationId, job.data.scanJobId, 'تعذّر استخراج البيانات من الصورة');
  logger.error({ scanJobId: job.data.scanJobId, error: error.message }, 'فشل الاستخراج نهائياً');
}

async function review(
  organizationId: string,
  scanJobId: string,
  extracted: ExtractedContact,
  confidence: number,
): Promise<void> {
  await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.scanJob.update({
      where: { id: scanJobId },
      data: {
        status: 'review',
        extracted: extracted as unknown as Prisma.InputJsonValue,
        confidence,
        processedAt: new Date(),
        error: null,
      },
    }),
  );
}

async function fail(organizationId: string, scanJobId: string, message: string): Promise<void> {
  await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.scanJob.updateMany({
      where: { id: scanJobId, status: { in: ['pending', 'processing'] } },
      // الرسالة بلغة المستخدم ولا تحمل شيئاً من محتوى الصورة ولا من
      // رد المزوّد: صاحب الشاشة يحتاج أن يعرف أن عليه الإدخال يدوياً،
      // لا أن يقرأ خطأ نظام خارجي.
      data: { status: 'failed', error: message, processedAt: new Date() },
    }),
  );
}
