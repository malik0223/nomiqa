import { randomInt } from 'node:crypto';
import { slugifyName } from '@nomiqa/validation';

/**
 * توليد رابط البطاقة العام.
 *
 * الرابط **يُولَّد ولا يختاره المستخدم**. اشتقاقه من الاسم وحده كان
 * يعطي `/salim-aldhahli` لأول من يحمله: رابط يُخمَّن من بطاقة ورقية أو
 * توقيع بريد، ويمكن عدّه للوصول إلى بطاقات لم يشاركها أصحابها. لذلك
 * تُلحق لاحقة عشوائية **دائماً**، لا عند التعارض فقط.
 *
 * يبقى الجزء المقروء لأن الرابط يُطبع تحت رمز QR ويُقرأ في اجتماع:
 * `salim-aldhahli-k3m9qp2` يدلّ على صاحبه، و`k3m9qp2` وحده لا يدلّ.
 *
 * دالة نقية عدا العشوائية: التفرّد مسؤولية المستدعي عبر القيد الفريد
 * في قاعدة البيانات، وهذه تضمن الشكل والمدى فقط.
 */

/**
 * بلا `0` و`1` و`i` و`l` و`o`.
 *
 * الرابط يُملى في الهاتف ويُقرأ عن ورق، والخلط بين صفر وحرف o خطأ
 * القارئ لا خطؤه. ٣١ حرفاً مقصودة: التقليل من الالتباس أهم من رقم أنيق.
 */
export const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** سبعة محارف من ٣١ ≈ ٢٧ مليار احتمال. */
export const SLUG_TOKEN_LENGTH = 7;

/** أقصى طول للجزء المقروء. مع اللاحقة يبقى الناتج تحت حد `slugSchema` (٤٨). */
const MAX_BASE_LENGTH = 32;

const FALLBACK_BASE = 'card';

/**
 * لاحقة عشوائية.
 *
 * `randomInt` من `node:crypto` لا `Math.random`: الأخير مولّد زائف
 * يمكن استنتاج حالته من مخرجاته، وهو ما يُبطل الغرض حين تكون اللاحقة
 * نفسها ما يمنع تخمين روابط الآخرين. و`randomInt` بلا انحياز القسمة.
 */
export function randomSlugToken(): string {
  let token = '';
  for (let index = 0; index < SLUG_TOKEN_LENGTH; index += 1) {
    token += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  }
  return token;
}

/** الجزء المقروء من الرابط. */
export function slugBase(fullName: string): string {
  const base = slugifyName(fullName).slice(0, MAX_BASE_LENGTH).replace(/-+$/g, '');
  return base.length > 0 ? base : FALLBACK_BASE;
}

/**
 * الرابط الكامل: جزء مقروء ثم لاحقة عشوائية.
 *
 * لا حاجة لفحص الكلمات المحجوزة: اللاحقة تجعل الناتج مختلفاً عن أي
 * كلمة محجوزة مهما كان الاسم — `admin` يصبح `admin-k3m9qp2`.
 */
export function buildCardSlug(fullName: string): string {
  return `${slugBase(fullName)}-${randomSlugToken()}`;
}
