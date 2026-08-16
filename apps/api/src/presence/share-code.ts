import { SHARE_CODE_LENGTH } from '@nomiqa/contracts';
import { randomBytes } from 'node:crypto';

/**
 * الكود القصير خلف `nomiqa.om/t/<code>`.
 *
 * يظهر في ثلاثة سياقات قاسية: مكتوب داخل وسم NFC لا يُعاد كتابته،
 * ومطبوع تحت رمز QR على لافتة معرض، ومقروءاً بالعين ليُكتب في متصفح
 * هاتف. كل قيد أدناه سببه أحد هذه الثلاثة.
 */

/**
 * أبجدية مشتقة من Crockford Base32.
 *
 * حُذفت `i` و`l` و`o` و`u`:
 *  - الثلاث الأولى تلتبس بـ1 و1 و0 عند القراءة من ورق مطبوع.
 *  - `u` حُذفت لسبب مختلف تماماً: بقاؤها مع بقية الحروف يجعل توليد
 *    كلمات إنجليزية بذيئة من ثمانية أحرف ممكناً، وكود يظهر على لافتة
 *    مؤسسة لا يُراجَع قبل الطباعة.
 *
 * الحجم 32 بالضبط، وهو ما يجعل استخراج خمس بتات لكل حرف بلا انحياز.
 */
export const SHARE_CODE_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/**
 * فضاء الأكواد: 32^8 ≈ 1.1 تريليون.
 *
 * الطول ثمانية لا ستة ولا اثني عشر. ستة (‎10^9) تجعل التخمين المنظّم
 * مجدياً على مسار عام حدُّه 120 طلباً في الدقيقة، واثنا عشر تجعل الكود
 * أطول من أن يُكتب يدوياً — وهو أحد سياقات استخدامه الثلاثة.
 */
export const SHARE_CODE_SPACE = 32 ** SHARE_CODE_LENGTH;

/**
 * يولّد كوداً عشوائياً.
 *
 * `randomBytes` لا `Math.random`: الكود هو **كل** ما يحمي الوسم. من
 * يستطيع التنبؤ بالكود التالي يستطيع طلب وسم لنفسه ثم استنتاج أكواد
 * وسوم صدرت بعده — وهو هجوم لا يحتاج إلا حساباً مجانياً.
 *
 * القناع `& 31` بلا انحياز لأن حجم الأبجدية 32 يقسم 256 بالضبط.
 */
export function generateShareCode(length: number = SHARE_CODE_LENGTH): string {
  const bytes = randomBytes(length);
  let code = '';

  for (let index = 0; index < length; index += 1) {
    code += SHARE_CODE_ALPHABET[bytes[index]! & 31];
  }

  return code;
}

/** الرابط الذي يُكتب في الوسم أو يُشفَّر في رمز الحملة. */
export function shareUrl(appBaseUrl: string, code: string): string {
  return `${appBaseUrl.replace(/\/+$/, '')}/t/${code}`;
}
