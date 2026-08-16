import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  QUEUE_NAMES,
  type AnalyticsIngestEvent,
  type AnalyticsIngestJobData,
} from '@nomiqa/contracts';
import type { AnalyticsBatchInput } from '@nomiqa/validation';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { deviceTypeOf, referrerHostOf, visitorHash } from './visitor-hash.js';

/**
 * سرّ التطوير.
 *
 * قيمة ثابتة معروفة تعمل محلياً بلا إعداد. لا خطر منها في التطوير —
 * التجزئة تخص جهاز المطوّر — ونحذّر بوضوح عند رفعها إلى الإنتاج، لأن
 * سرّاً معروفاً هناك يجعل تجزئة الزائر قابلة لإعادة الحساب من عنوان
 * مخمَّن، فيفقد التصميم كامل قيمته.
 */
const DEVELOPMENT_SECRET = 'nomiqa-development-visitor-secret';

/**
 * استقبال أحداث الصفحة العامة.
 *
 * الطلب يجب أن يكون رخيصاً بقدر ما يمكن: يصل من كل فتح بطاقة، والصفحة
 * العامة يُقاس نجاحها بزمن تحميلها. لذلك لا كتابة في قاعدة البيانات
 * هنا إطلاقاً — تحويل الحدث إلى رسالة في Redis ثم الرد. الكتابة
 * الفعلية تحدث في الـWorker على دفعات (§7.2 من خطة العمل).
 */
@Injectable()
export class AnalyticsIngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsIngestService.name);
  private queue!: Queue<AnalyticsIngestJobData>;
  private secret!: string;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleInit(): void {
    this.queue = new Queue<AnalyticsIngestJobData>(QUEUE_NAMES.ANALYTICS_INGEST, {
      connection: this.redis,
    });

    const configured = process.env.ANALYTICS_VISITOR_SECRET;

    if (!configured && process.env.NODE_ENV === 'production') {
      // نُسجّلها خطأً لا تحذيراً: القياس سيعمل، والخلل صامت تماماً —
      // وهو أسوأ أنواع الخلل في ضابط خصوصية.
      this.logger.error(
        'ANALYTICS_VISITOR_SECRET غير مضبوط في الإنتاج — تجزئة الزائر تستخدم سرّاً معروفاً',
      );
    }

    this.secret = configured ?? DEVELOPMENT_SECRET;
  }

  async onModuleDestroy(): Promise<void> {
    // الاتصال مشترك ويُغلق من RedisModule، فنغلق الطابور وحده.
    await this.queue?.close();
  }

  async ingest(
    slug: string,
    input: AnalyticsBatchInput,
    context: { ipAddress?: string; userAgent?: string; referrer?: string },
  ): Promise<void> {
    const at = new Date();

    // تُحسب مرة واحدة للدفعة كلها ثم تُتلف مكوناتها بانتهاء الطلب:
    // لا عنوان ولا User-Agent يغادر هذه الدالة.
    const hash = visitorHash({
      secret: this.secret,
      ipAddress: context.ipAddress ?? 'unknown',
      userAgent: context.userAgent ?? 'unknown',
      slug,
      at,
    });

    const deviceType = context.userAgent ? deviceTypeOf(context.userAgent) : null;
    const referrerHost = referrerHostOf(context.referrer);

    // الإسناد خاصية الزيارة لا الحدث، فيصل مرة واحدة ويُنسخ على كل
    // حدث في الدفعة: التخزين على مستوى الصف هو ما يجعل التجميع لاحقاً
    // استعلاماً واحداً بلا انضمام إلى جدول جلسات لا وجود له.
    const source = input.attribution?.source ?? null;
    const campaignCode = input.attribution?.campaignCode ?? null;

    const events: AnalyticsIngestEvent[] = input.events.map((event) => ({
      slug,
      type: event.type,
      // معرّف الرابط لا معنى له خارج النقرة، وقبوله في غيرها يفتح
      // بُعداً وهمياً في التجميع.
      linkId: event.type === 'link_click' ? (event.linkId ?? null) : null,
      visitorHash: hash,
      locale: event.locale ?? null,
      referrerHost,
      deviceType,
      source,
      // الكود لا المعرّف: ترجمته تحدث في دالة الإدراج داخل قاعدة
      // البيانات، فيبقى هذا المسار بلا استعلام واحد.
      campaignCode,
      // الوقت من الخادم لا من العميل: ساعة الجهاز قابلة للضبط، وقبولها
      // يسمح بكتابة أحداث في الماضي تشوّه تقرير شهر مضى.
      occurredAt: at.toISOString(),
    }));

    await this.queue.add(
      'ingest',
      { events },
      {
        // ثلاث محاولات لا خمس: الحدث قياس لا معاملة. إصراره على
        // النجاح لا يستحق إشغال الطابور بمهمة لا يلاحظ أحد فقدانها.
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: { count: 500 },
      },
    );
  }
}
