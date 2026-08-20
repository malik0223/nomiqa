import { Global, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * اتصال Redis واحد مشترك.
 *
 * كل خدمة كانت تنشئ اتصالها، فيتضاعف عدد الاتصالات مع كل خدمة جديدة
 * ويستنزف حصة الاتصالات في الخدمات المُدارة بلا داعٍ.
 *
 * `maxRetriesPerRequest: null` مطلوب لـBullMQ، وغير ضار لبقية
 * الاستخدامات لأنها تتعامل مع فشل Redis صراحةً.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        const url = process.env.REDIS_URL;
        if (!url) {
          throw new Error('REDIS_URL مطلوب');
        }

        const logger = new Logger('Redis');
        // family: 0 يحلّ العنوان بـIPv4 وIPv6 معاً — الشبكة الخاصة في Railway
        // على IPv6 فقط، وافتراض ioredis (IPv4) يفشل في الوصول إليها.
        const client = new Redis(url, { maxRetriesPerRequest: null, family: 0 });

        client.on('error', (error: Error) => {
          logger.error(`خطأ في اتصال Redis: ${error.message}`);
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    // الإغلاق يتم عبر الحاوية عند إيقاف التطبيق.
  }
}
