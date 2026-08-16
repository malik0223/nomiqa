import type { BillingInterval } from '@nomiqa/contracts';

/**
 * حساب مبالغ الفاتورة.
 *
 * دوال نقية بلا قاعدة بيانات ولا وقت نظام: هذه أرقام تظهر في مستند
 * ضريبي بيد العميل، وأي انحراف فيها يُكتشف عند محاسب لا عندنا. كلها
 * أعداد صحيحة بالبيسة — لا `number` عشري يمر من هنا.
 *
 * ترتيب العمليات ثابت ومقصود: **الخصم قبل الضريبة**. ضريبة القيمة
 * المضافة تُحتسب على المقابل المدفوع فعلاً، فاحتسابها قبل الخصم يُحصّل
 * من العميل ضريبةً على مبلغ لم يدفعه.
 */

/** ضريبة القيمة المضافة في سلطنة عُمان: 5% = 500 نقطة أساسية. */
export const DEFAULT_VAT_RATE_BPS = 500;

export const BASIS_POINTS = 10_000;

export interface CouponInput {
  discountType: 'percent' | 'fixed';
  /** نقاط أساسية إن كان percent، أو بيسة إن كان fixed. */
  discountValue: number;
}

export interface InvoiceAmounts {
  subtotalBaisa: number;
  discountBaisa: number;
  vatRateBps: number;
  vatBaisa: number;
  totalBaisa: number;
}

/**
 * يحسب مبالغ فاتورة من مبلغ أساسي وخصم ونسبة ضريبة.
 *
 * التقريب `Math.round` لا `floor` ولا `ceil`: التقريب لأسفل دائماً
 * يخسر المنصة بيسة في كل فاتورة، ولأعلى يزيد على العميل. التقريب
 * الحسابي هو ما تتوقعه أنظمة المحاسبة.
 */
export function computeInvoiceAmounts(
  subtotalBaisa: number,
  coupon: CouponInput | null,
  vatRateBps: number = DEFAULT_VAT_RATE_BPS,
): InvoiceAmounts {
  if (!Number.isInteger(subtotalBaisa) || subtotalBaisa < 0) {
    throw new Error('المبلغ الأساسي يجب أن يكون عدداً صحيحاً غير سالب بالبيسة');
  }

  const discountBaisa = computeDiscount(subtotalBaisa, coupon);
  const taxable = subtotalBaisa - discountBaisa;
  const vatBaisa = Math.round((taxable * vatRateBps) / BASIS_POINTS);

  return {
    subtotalBaisa,
    discountBaisa,
    vatRateBps,
    vatBaisa,
    totalBaisa: taxable + vatBaisa,
  };
}

/** الخصم لا يتجاوز المبلغ نفسه — فاتورة بمجموع سالب لا معنى لها. */
export function computeDiscount(subtotalBaisa: number, coupon: CouponInput | null): number {
  if (!coupon) {
    return 0;
  }

  const raw =
    coupon.discountType === 'percent'
      ? Math.round((subtotalBaisa * coupon.discountValue) / BASIS_POINTS)
      : coupon.discountValue;

  return Math.min(Math.max(raw, 0), subtotalBaisa);
}

/**
 * يحسب نهاية الفترة التالية.
 *
 * الشهر يُضاف تقويمياً لا بثلاثين يوماً: عميل اشترك في 31 يناير يتوقع
 * التجديد آخر فبراير لا في الأول من مارس. `setMonth` في JavaScript
 * يقفز إلى الشهر التالي حين لا يوجد اليوم المقابل، فنصحّحه إلى آخر يوم
 * في الشهر المقصود.
 */
export function addInterval(from: Date, interval: BillingInterval): Date {
  const next = new Date(from.getTime());
  const day = next.getUTCDate();

  if (interval === 'year') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }

  // انزلق إلى شهر لاحق لأن اليوم غير موجود (31 → فبراير): نرجع إلى
  // آخر يوم في الشهر المقصود.
  if (next.getUTCDate() !== day) {
    next.setUTCDate(0);
  }

  return next;
}

/**
 * الرصيد المتبقي من الفترة الحالية عند الترقية.
 *
 * التناسب بالأيام لا بالثواني: الفوترة مستند يُقرأ، و«12 يوماً متبقية»
 * قابلة للتحقق بينما كسر يوم بالثواني ليس كذلك.
 *
 * يُرجع صفراً لفترة منتهية أو مبلغ صفري — لا رصيد سالب.
 */
export function unusedCredit(
  paidAmountBaisa: number,
  periodStart: Date,
  periodEnd: Date,
  now: Date,
): number {
  if (paidAmountBaisa <= 0) {
    return 0;
  }

  const totalDays = daysBetween(periodStart, periodEnd);
  if (totalDays <= 0) {
    return 0;
  }

  const remainingDays = Math.max(0, daysBetween(now, periodEnd));
  const credit = Math.round((paidAmountBaisa * Math.min(remainingDays, totalDays)) / totalDays);

  return Math.max(0, Math.min(credit, paidAmountBaisa));
}

function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** ريال عُماني للعرض. للطباعة وحدها — لا يعود رقماً عشرياً إلى الحساب. */
export function formatOmr(baisa: number): string {
  const sign = baisa < 0 ? '-' : '';
  const absolute = Math.abs(baisa);
  return `${sign}${Math.floor(absolute / 1000)}.${String(absolute % 1000).padStart(3, '0')}`;
}
