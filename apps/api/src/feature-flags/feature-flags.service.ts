import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

const CACHE_KEY = 'ff:all';
const CACHE_TTL_SECONDS = 60;

export interface EvaluatedFlags {
  [key: string]: boolean;
}

interface FlagSnapshot {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;
  overrides: Array<{ organizationId: string; enabled: boolean }>;
}

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * يقيّم كل الرايات لمؤسسة.
   *
   * ترتيب الأسبقية مقصود:
   *   1. استثناء صريح للمؤسسة — أقوى شيء، وهو ما يُستخدم لإطفاء
   *      ميزة عن عميل واحد يواجه عطلاً دون تعطيلها عن الجميع.
   *   2. التفعيل العام.
   *   3. الإطلاق التدريجي بالنسبة.
   */
  async evaluateAll(organizationId: string | null): Promise<EvaluatedFlags> {
    const flags = await this.loadFlags();
    const result: EvaluatedFlags = {};

    for (const flag of flags) {
      result[flag.key] = this.evaluate(flag, organizationId);
    }

    return result;
  }

  async isEnabled(key: string, organizationId: string | null): Promise<boolean> {
    const flags = await this.loadFlags();
    const flag = flags.find((item) => item.key === key);

    // راية غير معرّفة = مطفأة. الافتراض الآمن أن الميزة غير جاهزة.
    return flag ? this.evaluate(flag, organizationId) : false;
  }

  private evaluate(flag: FlagSnapshot, organizationId: string | null): boolean {
    if (organizationId) {
      const override = flag.overrides.find((item) => item.organizationId === organizationId);
      if (override) {
        return override.enabled;
      }
    }

    if (flag.enabled) {
      return true;
    }

    if (flag.rolloutPercentage <= 0 || !organizationId) {
      return false;
    }

    /**
     * تجزئة ثابتة من مفتاح الراية ومعرّف المؤسسة.
     *
     * الثبات ضروري: لو استُخدم عشوائي لتذبذبت الميزة بين طلب وآخر
     * لنفس المؤسسة، فرأى المستخدم واجهة تظهر وتختفي. وإدخال مفتاح
     * الراية في التجزئة يمنع وقوع نفس المؤسسات دائماً في أول شريحة
     * من كل راية.
     */
    const digest = createHash('sha256').update(`${flag.key}:${organizationId}`).digest();
    const bucket = digest.readUInt32BE(0) % 100;

    return bucket < flag.rolloutPercentage;
  }

  /** يقرأ الرايات من الـcache أو من قاعدة البيانات. */
  private async loadFlags(): Promise<FlagSnapshot[]> {
    try {
      const cached = await this.redis.get(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached) as FlagSnapshot[];
      }
    } catch (error) {
      // تعطّل Redis لا يعطّل التقييم — نقرأ من قاعدة البيانات.
      this.logger.warn(`تعذّرت قراءة cache الرايات: ${(error as Error).message}`);
    }

    const rows = await this.prisma.featureFlag.findMany({
      include: { overrides: { select: { organizationId: true, enabled: true } } },
    });

    const snapshot: FlagSnapshot[] = rows.map((row) => ({
      key: row.key,
      enabled: row.enabled,
      rolloutPercentage: row.rolloutPercentage,
      overrides: row.overrides,
    }));

    try {
      await this.redis.set(CACHE_KEY, JSON.stringify(snapshot), 'EX', CACHE_TTL_SECONDS);
    } catch {
      // الكتابة في الـcache تحسين لا شرط.
    }

    return snapshot;
  }

  // ---------- عمليات الإدارة ----------

  async list() {
    return this.prisma.featureFlag.findMany({
      include: { overrides: true },
      orderBy: { key: 'asc' },
    });
  }

  async update(key: string, input: { enabled?: boolean; rolloutPercentage?: number }) {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!existing) {
      throw new NotFoundException('الراية غير موجودة');
    }

    const updated = await this.prisma.featureFlag.update({ where: { key }, data: input });
    await this.invalidate();

    return updated;
  }

  async setOverride(key: string, organizationId: string, enabled: boolean) {
    const result = await this.prisma.featureFlagOverride.upsert({
      where: { flagKey_organizationId: { flagKey: key, organizationId } },
      update: { enabled },
      create: { flagKey: key, organizationId, enabled },
    });

    await this.invalidate();
    return result;
  }

  async clearOverride(key: string, organizationId: string): Promise<void> {
    await this.prisma.featureFlagOverride.deleteMany({
      where: { flagKey: key, organizationId },
    });
    await this.invalidate();
  }

  /**
   * إبطال الـcache فور التعديل.
   *
   * بدونه يبقى الإطفاء الطارئ غير فعّال حتى دقيقة كاملة — وهي مدة
   * طويلة حين تكون الراية مطفأة لإيقاف عطل يضرب المستخدمين.
   */
  private async invalidate(): Promise<void> {
    try {
      await this.redis.del(CACHE_KEY);
    } catch (error) {
      this.logger.error(`تعذّر إبطال cache الرايات: ${(error as Error).message}`);
    }
  }
}
