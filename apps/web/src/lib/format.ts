/**
 * تنسيق التواريخ والأوقات.
 *
 * سبب وجوده: `toLocaleDateString('ar')` تُخرج «١٦‏/٨‏/٢٠٢٦» محشوّة
 * بعلامات اتجاه (RLM) بين الأجزاء. حين تُوضع هذه السلسلة في عمود
 * لاتيني الاتجاه — وهو ما يتطلبه عمود أرقام قابل للمقارنة — تعيد
 * تلك العلامات ترتيب الأجزاء فيظهر «162026/8/».
 *
 * الحل ليس إجبار الاتجاه فوقها بل تجنّب النمط الرقمي أصلاً: الشهر
 * بالاسم لا بالرقم، فلا فواصل ولا علامات اتجاه، ويُقرأ التاريخ في
 * الاتجاهين بلا التباس. والأرقام لاتينية لأن الشاشة نفسها تعرض
 * مبالغ فواتير وأرقام معاملات لاتينية.
 */

const dateCache = new Map<string, Intl.DateTimeFormat>();
const dateTimeCache = new Map<string, Intl.DateTimeFormat>();

function resolve(locale: string): string {
  return locale === 'ar' ? 'ar-OM-u-nu-latn' : locale;
}

export function formatDate(value: string | Date, locale: string): string {
  let formatter = dateCache.get(locale);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat(resolve(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    dateCache.set(locale, formatter);
  }

  return formatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDateTime(value: string | Date, locale: string): string {
  let formatter = dateTimeCache.get(locale);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat(resolve(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    dateTimeCache.set(locale, formatter);
  }

  return formatter.format(typeof value === 'string' ? new Date(value) : value);
}
