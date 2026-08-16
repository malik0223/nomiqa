import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * محرك التعرّف الضوئي — خلف واجهة (ADR-016).
 *
 * لماذا واجهة لا نداء مباشر: التعرّف على الحروف قدرةٌ تُشترى، وأسواقها
 * تتغير. أما ما يخصّنا — تحويل النص إلى حقول — فيعيش في
 * `apps/api/src/scans/card-parser.ts` ولا يتغير بتغيّر المزوّد. الفصل
 * يجعل استبدال المزوّد ملفاً واحداً، وهو الشرط الذي وضعته وثيقة
 * المعمارية §2.2 على كل اعتماد خارجي.
 *
 * والافتراضي `none` عمداً: المنصة تعمل بلا محرك مضبوط، وتعرض للمندوب
 * نموذجاً يملؤه بنفسه. ميزةٌ تتعطّل بلا مفتاح خارجي تجعل التثبيت
 * المحلي وبيئة الاختبار عاجزين عن اختبار المسار كله.
 */

export interface OcrResult {
  /** النص كما قرأه المحرك، بأسطره. */
  text: string;
  /** لغة أو لغات استُدلّ عليها. للتشخيص لا للعرض. */
  locales: string[];
}

export interface OcrProvider {
  readonly name: string;
  recognize(image: Buffer, mimeType: string): Promise<OcrResult>;
}

/** لغات الطلب: العربية والإنجليزية معاً — والبطاقة العُمانية تحملهما. */
const LANGUAGE_HINTS = ['ar', 'en'];

/** المحرك غير مضبوط: يرمي برسالة صريحة يفهمها المستخدم في الشاشة. */
class NullOcrProvider implements OcrProvider {
  readonly name = 'none';

  async recognize(): Promise<OcrResult> {
    throw new OcrUnavailableError();
  }
}

/**
 * خطأ «لا محرك».
 *
 * صنف مستقل لأن معالج المهمة يعامله معاملة مختلفة تماماً: ليس فشلاً
 * يُعاد معه المحاولة ثلاث مرات، بل حالة إعداد ثابتة. إعادة المحاولة
 * عليها تشغل الطابور بما لن ينجح أبداً.
 */
export class OcrUnavailableError extends Error {
  constructor() {
    super('محرك التعرّف الضوئي غير مضبوط');
    this.name = 'OcrUnavailableError';
  }
}

/**
 * Google Cloud Vision عبر REST.
 *
 * REST لا SDK: النداء واحد بحمولة JSON، وسحب حزمة سحابية كاملة لأجله
 * يضيف عشرات الاعتماديات إلى صورة الـWorker مقابل دالة واحدة.
 *
 * `DOCUMENT_TEXT_DETECTION` لا `TEXT_DETECTION`: الأولى تحافظ على
 * ترتيب الأسطر والكتل، وترتيب السطور هو ما يعتمد عليه تصنيف الحقول
 * عندنا. الثانية تعيد كلمات مبعثرة يستحيل معها معرفة أيها اسم.
 */
class GoogleVisionProvider implements OcrProvider {
  readonly name = 'google_vision';

  constructor(private readonly apiKey: string) {}

  async recognize(image: Buffer): Promise<OcrResult> {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image.toString('base64') },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
              imageContext: { languageHints: LANGUAGE_HINTS },
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      // بلا نص الاستجابة: قد يحمل صدى للحمولة، وحمولتنا صورة بطاقة
      // شخص. رمز الحالة يكفي للتشخيص.
      throw new Error(`فشل محرك التعرّف الضوئي (${response.status})`);
    }

    const body = (await response.json()) as {
      responses?: Array<{
        fullTextAnnotation?: { text?: string };
        error?: { message?: string };
      }>;
    };

    const first = body.responses?.[0];

    if (first?.error?.message) {
      throw new Error(`فشل محرك التعرّف الضوئي: ${first.error.message}`);
    }

    return { text: first?.fullTextAnnotation?.text ?? '', locales: LANGUAGE_HINTS };
  }
}

let provider: OcrProvider | undefined;

export function getOcrProvider(): OcrProvider {
  if (provider) return provider;

  const configured = process.env.OCR_PROVIDER ?? 'none';

  if (configured === 'google_vision') {
    const apiKey = process.env.GOOGLE_VISION_API_KEY;

    if (!apiKey) {
      // إعداد ناقص لا يجوز أن يُقرأ «معطّل»: من ضبط المزوّد يتوقع أنه
      // يعمل، والسقوط الصامت إلى الإدخال اليدوي يخفي الخطأ أسابيع.
      throw new Error('GOOGLE_VISION_API_KEY مطلوب حين يكون OCR_PROVIDER=google_vision');
    }

    provider = new GoogleVisionProvider(apiKey);
    return provider;
  }

  provider = new NullOcrProvider();
  return provider;
}

let s3: S3Client | undefined;

/** يقرأ صورة المسح من التخزين الخاص. */
export async function readStoredImage(storageKey: string): Promise<Buffer> {
  const bucket = process.env.S3_BUCKET;

  if (!bucket) {
    throw new Error('S3_BUCKET مطلوب لقراءة صور المسح');
  }

  s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  });

  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
  const bytes = await object.Body?.transformToByteArray();

  if (!bytes) {
    throw new Error('الصورة غير موجودة في التخزين');
  }

  return Buffer.from(bytes);
}
