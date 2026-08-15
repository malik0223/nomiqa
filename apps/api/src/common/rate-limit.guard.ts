import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import {
  RATE_LIMIT_KEY,
  SKIP_RATE_LIMIT_KEY,
  type RateLimitOptions,
} from './rate-limit.decorator.js';

const DEFAULT_LIMIT: RateLimitOptions = { limit: 300, windowSeconds: 60 };

/**
 * تحديد المعدل الموزّع عبر Redis (§9.3).
 *
 * Redis لا خيار هنا: التطبيق يعمل بعدة نسخ، وعدّاد في الذاكرة يجعل
 * الحد الفعلي مضروباً في عدد النسخ — أي بلا معنى.
 *
 * نافذة ثابتة بـINCR ذرّي: تسمح بذروة على حدود النافذتين، لكنها
 * أرخص بكثير من النافذة المنزلقة وكافية لمنع الإساءة. الترقية إلى
 * منزلقة تتم عند ظهور إساءة فعلية تستغل الحدود.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_LIMIT;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const identity = this.identify(request);
    const window = Math.floor(Date.now() / 1000 / options.windowSeconds);
    const key = `rl:${identity}:${context.getClass().name}.${context.getHandler().name}:${window}`;

    let current: number;
    try {
      // INCR ثم EXPIRE في رحلة واحدة. EXPIRE عند أول زيادة فقط،
      // وإلا امتدت النافذة مع كل طلب فلم تنتهِ أبداً.
      const [incremented] = (await this.redis
        .multi()
        .incr(key)
        .expire(key, options.windowSeconds, 'NX')
        .exec()) as Array<[Error | null, number]>;

      current = incremented?.[1] ?? 0;
    } catch (error) {
      // فشل مفتوح: تعطّل Redis يجب ألا يوقف الـAPI كله. نسجّله بوضوح
      // لأن استمراره يعني أن الحماية معطّلة صامتاً.
      this.logger.error(`تعذّر تطبيق حد المعدل: ${(error as Error).message}`);
      return true;
    }

    const remaining = Math.max(0, options.limit - current);
    response.setHeader('X-RateLimit-Limit', options.limit);
    response.setHeader('X-RateLimit-Remaining', remaining);

    if (current > options.limit) {
      const retryAfter =
        options.windowSeconds - (Math.floor(Date.now() / 1000) % options.windowSeconds);
      response.setHeader('Retry-After', retryAfter);

      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'تجاوزت عدد الطلبات المسموح. حاول بعد قليل.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * هوية المُحاسَب.
   *
   * عملياً العنوان دائماً: هذا الحارس يعمل **قبل** المصادقة عمداً
   * حتى تُحاسَب الطلبات المجهولة، فلا تكون الهوية قد حُلّت بعد.
   * فحص المستخدم مُبقى ليعمل تلقائياً إن أُعيد ترتيب الحرّاس لاحقاً
   * أو أُضيف حارس ثانٍ بعد المصادقة.
   *
   * تنبيه نشر: خلف موازن حمل يجب ضبط `trust proxy` ليكون `req.ip`
   * عنوان العميل الحقيقي، وإلا صار كل المستخدمين عنواناً واحداً
   * فانهار الحد على الجميع دفعة واحدة.
   */
  private identify(request: Request): string {
    if (request.user?.id) {
      return `u:${request.user.id}`;
    }

    return `ip:${request.ip ?? 'unknown'}`;
  }
}
