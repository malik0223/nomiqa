import { describe, expect, it } from 'vitest';
import { maxCardsFor, PLAN_LIMITS, resolvePlan } from './entitlements.js';

describe('الحصص', () => {
  it('الباقة المجانية بطاقة واحدة', () => {
    expect(PLAN_LIMITS.free.maxCards).toBe(1);
  });

  it('نوع المؤسسة لا يرفع الحصة', () => {
    // مؤسسة business بلا اشتراك تبقى على الحد المجاني، وإلا صار تغيير
    // حقل kind تجاوزاً مجانياً للحصة.
    expect(resolvePlan({ kind: 'business' })).toBe('free');
    expect(maxCardsFor({ kind: 'business' })).toBe(maxCardsFor({ kind: 'personal' }));
  });
});
