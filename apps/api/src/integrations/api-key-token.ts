import { API_KEY_PREFIX } from '@nomiqa/contracts';
import { createHash, randomBytes } from 'node:crypto';

/**
 * مفاتيح الـAPI العام (§11.4).
 *
 * المفتاح ثلاثة مقاطع: `nmq_<البادئة>_<السرّ>`.
 *
 *  · البادئة تُخزَّن صريحةً وتظهر في اللوحة وفي السجلات. وجودها يجيب
 *    عن السؤال الوحيد الذي يُسأل عند حادثة: **أيّ مفتاح هذا؟** — بلا
 *    أن نحتفظ بما يكفي لاستخدامه.
 *  · السرّ لا يُخزَّن إطلاقاً. نحفظ `SHA-256` له، فقاعدة بيانات
 *    مسرّبة لا تسلّم مفاتيح صالحة.
 *
 * ولماذا SHA-256 لا bcrypt خلافاً لكلمات المرور: هذا سرّ **عشوائي
 * بـ256 بت** لا كلمة يختارها إنسان. لا قاموس يخمّنه، والتجزئة البطيئة
 * هنا تكلفة على كل طلب API بلا مقابل أمني.
 */

const SECRET_BYTES = 32;
const PREFIX_BYTES = 4;

export interface GeneratedApiKey {
  /** ما يُعرض مرة واحدة للمستخدم. */
  token: string;
  /** ما يُخزَّن صريحاً. */
  prefix: string;
  /** ما يُخزَّن بدل السرّ. */
  tokenHash: string;
}

/**
 * الترميز ست عشري لا base64url.
 *
 * ليس تفضيلاً: أبجدية base64url تحوي `_`، وهو نفسه فاصل المقاطع —
 * فمفتاح واحد من كل ثلاثة كان يُقرأ بأربعة مقاطع ويُرفض عند الاستخدام
 * بلا سبب مفهوم لمن أنشأه. المفتاح يُنسخ مرة إلى ملف إعداد، فطوله لا
 * يزعج أحداً وغموض حدوده يزعج الجميع.
 */
export function generateApiKey(): GeneratedApiKey {
  const prefix = randomBytes(PREFIX_BYTES).toString('hex');
  const secret = randomBytes(SECRET_BYTES).toString('hex');
  const token = `${API_KEY_PREFIX}_${prefix}_${secret}`;

  return { token, prefix, tokenHash: hashApiKey(token) };
}

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * يقرأ بادئة مفتاح واصل.
 *
 * تُستخدم في السجلات وفي رسائل الخطأ. تُرجع null لكل ما لا يطابق
 * الشكل — والحارس يرفض حينها بلا أن يستعلم عن قاعدة البيانات أصلاً،
 * فلا يصير مسار المفتاح قناةً لإغراق قاعدة البيانات بنصوص عشوائية.
 */
export function readApiKeyPrefix(token: string): string | null {
  const parts = token.split('_');

  if (parts.length !== 3 || parts[0] !== API_KEY_PREFIX) {
    return null;
  }

  const [, prefix, secret] = parts;

  if (!prefix || !secret || prefix.length !== 8 || secret.length < 32) {
    return null;
  }

  return prefix;
}
