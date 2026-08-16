import { ConflictException } from '@nestjs/common';
import { Prisma } from '@nomiqa/database';
import { generateShareCode } from './share-code.js';

/** محاولات توليد كود غير مستخدم قبل الاستسلام. */
const CODE_COLLISION_RETRIES = 5;

/**
 * ينفّذ عملاً بكود مولَّد، ويعيد المحاولة بكود جديد عند التصادم.
 *
 * **يلفّ المعاملة ولا يُلَفّ بها.** هذا ليس تفصيلاً أسلوبياً: في
 * PostgreSQL يُجهض خطأ واحد المعاملة كلها، فحلقة إعادة محاولة **داخل**
 * `withRlsContext` كانت ستنفّذ محاولتها الثانية في معاملة ميتة وتفشل
 * بخطأ لا علاقة له بالسبب.
 *
 * التصادم في فضاء 32^8 نادر إلى حد الإهمال، لكن «نادر» ليست «مستحيلة»،
 * وظهوره للمستخدم كخطأ خادم عند إصدار وسم — بلا سبب مفهوم ولا إجراء
 * ممكن — ثمنٌ لا يستحقه توفير هذه الحلقة.
 *
 * وخمس محاولات لا حلقة مفتوحة: تكرار الفشل خمساً لا يعني حظاً سيئاً بل
 * خللاً في التوليد، وحلقة لا نهائية تخفيه.
 */
export async function withUniqueShareCode<T>(work: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < CODE_COLLISION_RETRIES; attempt += 1) {
    try {
      return await work(generateShareCode());
    } catch (error) {
      const isCollision =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

      if (!isCollision) {
        throw error;
      }
    }
  }

  throw new ConflictException('تعذّر توليد كود فريد، أعد المحاولة');
}
