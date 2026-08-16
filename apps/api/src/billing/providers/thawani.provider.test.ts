import { describe, expect, it } from 'vitest';
import { mapStatus } from './thawani.provider.js';

describe('mapStatus', () => {
  it('يترجم الحالات المعروفة', () => {
    expect(mapStatus('paid')).toBe('paid');
    expect(mapStatus('SUCCESS')).toBe('paid');
    expect(mapStatus('cancelled')).toBe('canceled');
    expect(mapStatus('failed')).toBe('failed');
    expect(mapStatus('expired')).toBe('failed');
  });

  it('يعتبر الحالة المجهولة معلّقة لا فاشلة', () => {
    // وسم دفعة ناجحة بحالة غير معروفة بأنها فاشلة يُلغي اشتراكاً مدفوعاً.
    expect(mapStatus('processing')).toBe('pending');
    expect(mapStatus('')).toBe('pending');
    expect(mapStatus('something_new')).toBe('pending');
  });
});
