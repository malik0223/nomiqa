import { createHmac } from 'node:crypto';

/**
 * تجزئة الزائر.
 *
 * المشكلة: قياس «الزوار الفريدين» يحتاج تمييز زائر عن آخر، وكل الطرق
 * المعتادة — كوكي تتبّع، بصمة متصفح، تخزين IP — تنشئ معرّفاً دائماً
 * لشخص لم يوافق على شيء ولم يسجّل في المنصة.
 *
 * الحل هنا: HMAC على (IP + User-Agent + slug + تاريخ اليوم) بمفتاح
 * سرّي، ثم **إتلاف المدخلات فوراً** — لا يُخزَّن منها شيء.
 *
 * ما يعطيه ذلك:
 *  - تمييز زائرين مختلفين في اليوم نفسه على البطاقة نفسها.
 *
 * ما لا يعطيه، عمداً:
 *  - ربط زيارات الشخص عبر الأيام: التاريخ في المدخل، فتتغير التجزئة
 *    كل منتصف ليل. لذلك «الزائر الفريد» مقياس يومي لا تراكمي.
 *  - ربط زيارات الشخص عبر البطاقات: الـslug في المدخل.
 *  - العودة من التجزئة إلى العنوان: HMAC بمفتاح سرّي، والبحث الشامل
 *    على مساحة العناوين لا يفيد بلا المفتاح.
 *
 * راجع docs/analytics/definitions.md — ما يقيسه هذا الرقم وما لا يقيسه
 * مكتوبٌ هناك لأن الفرق بينهما هو ما سيقرأه المستخدم في لوحته.
 */
export function visitorHash(input: {
  secret: string;
  ipAddress: string;
  userAgent: string;
  slug: string;
  at: Date;
}): string {
  const day = input.at.toISOString().slice(0, 10);

  return createHmac('sha256', input.secret)
    .update(`${day}|${input.slug}|${input.ipAddress}|${input.userAgent}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * نوع الجهاز من User-Agent.
 *
 * تصنيف خشن بثلاث قيم لا مكتبة كشف كاملة: القيمة التشغيلية هي «هل
 * تُفتح بطاقتي على الهاتف؟»، وهو سؤال يجيبه هذا التصنيف. تخزين سلسلة
 * الـUser-Agent كاملةً للإجابة عليه يخزّن بصمة متصفح بلا داع.
 */
export function deviceTypeOf(userAgent: string): 'mobile' | 'tablet' | 'desktop' {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(userAgent)) {
    return 'tablet';
  }
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(userAgent)) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * نطاق المُحيل وحده.
 *
 * المسار الكامل قد يحمل معرّفات في سلسلة الاستعلام — رمز حملة، معرّف
 * جلسة في منصة أخرى، أحياناً بريداً. النطاق يجيب «من أين جاء الزائر؟»
 * وهو كل ما نحتاجه.
 */
export function referrerHostOf(referrer: string | undefined): string | null {
  if (!referrer) return null;

  try {
    const { hostname } = new URL(referrer);
    return hostname.length > 0 ? hostname.slice(0, 253) : null;
  } catch {
    return null;
  }
}
