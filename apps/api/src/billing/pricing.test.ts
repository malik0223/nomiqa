import { describe, expect, it } from 'vitest';
import {
  addInterval,
  computeDiscount,
  computeInvoiceAmounts,
  DEFAULT_VAT_RATE_BPS,
  formatOmr,
  unusedCredit,
} from './pricing.js';

describe('computeInvoiceAmounts', () => {
  it('يحتسب ضريبة 5% على مبلغ بلا خصم', () => {
    const amounts = computeInvoiceAmounts(5_000, null);

    expect(amounts).toEqual({
      subtotalBaisa: 5_000,
      discountBaisa: 0,
      vatRateBps: DEFAULT_VAT_RATE_BPS,
      vatBaisa: 250,
      totalBaisa: 5_250,
    });
  });

  it('يخصم قبل الضريبة لا بعدها', () => {
    // 5000 ناقص 20% = 4000، والضريبة على 4000 لا على 5000.
    const amounts = computeInvoiceAmounts(5_000, { discountType: 'percent', discountValue: 2_000 });

    expect(amounts.discountBaisa).toBe(1_000);
    expect(amounts.vatBaisa).toBe(200);
    expect(amounts.totalBaisa).toBe(4_200);
  });

  it('لا يتجاوز الخصم المبلغ نفسه', () => {
    const amounts = computeInvoiceAmounts(3_000, { discountType: 'fixed', discountValue: 9_000 });

    expect(amounts.discountBaisa).toBe(3_000);
    expect(amounts.totalBaisa).toBe(0);
  });

  it('يقرّب الضريبة حسابياً لا لأسفل', () => {
    // 1% من 5% ‏= 25.5 بيسة عند مبلغ 510.
    expect(computeInvoiceAmounts(510, null).vatBaisa).toBe(26);
  });

  it('يرفض مبلغاً عشرياً أو سالباً', () => {
    expect(() => computeInvoiceAmounts(10.5, null)).toThrow();
    expect(() => computeInvoiceAmounts(-1, null)).toThrow();
  });
});

describe('computeDiscount', () => {
  it('يعيد صفراً بلا كود', () => {
    expect(computeDiscount(5_000, null)).toBe(0);
  });

  it('يتعامل مع الخصم الثابت بالبيسة', () => {
    expect(computeDiscount(5_000, { discountType: 'fixed', discountValue: 1_500 })).toBe(1_500);
  });
});

describe('addInterval', () => {
  it('يضيف شهراً تقويمياً', () => {
    expect(addInterval(new Date('2026-01-15T00:00:00Z'), 'month').toISOString()).toBe(
      '2026-02-15T00:00:00.000Z',
    );
  });

  it('يثبّت آخر يوم في الشهر بدل القفز إلى الشهر التالي', () => {
    // 31 يناير + شهر لا يجوز أن يصير 3 مارس.
    expect(addInterval(new Date('2026-01-31T00:00:00Z'), 'month').toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('يضيف سنة', () => {
    expect(addInterval(new Date('2026-03-10T00:00:00Z'), 'year').toISOString()).toBe(
      '2027-03-10T00:00:00.000Z',
    );
  });
});

describe('unusedCredit', () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const end = new Date('2026-01-31T00:00:00Z');

  it('يعيد نصف المبلغ في منتصف الفترة', () => {
    expect(unusedCredit(3_000, start, end, new Date('2026-01-16T00:00:00Z'))).toBe(1_500);
  });

  it('يعيد صفراً بعد انتهاء الفترة', () => {
    expect(unusedCredit(3_000, start, end, new Date('2026-02-05T00:00:00Z'))).toBe(0);
  });

  it('لا يتجاوز الرصيد المبلغ المدفوع', () => {
    expect(unusedCredit(3_000, start, end, new Date('2025-12-01T00:00:00Z'))).toBe(3_000);
  });

  it('يعيد صفراً لفاتورة مجانية', () => {
    expect(unusedCredit(0, start, end, new Date('2026-01-10T00:00:00Z'))).toBe(0);
  });
});

describe('formatOmr', () => {
  it('يطبع ثلاث خانات عشرية دائماً', () => {
    expect(formatOmr(5_250)).toBe('5.250');
    expect(formatOmr(50)).toBe('0.050');
    expect(formatOmr(1_000)).toBe('1.000');
  });
});
