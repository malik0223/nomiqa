import { describe, expect, it } from 'vitest';
import { deriveSlugBase } from './slug.js';

describe('deriveSlugBase', () => {
  it('يشتق الأساس من الجزء المحلي في البريد', () => {
    expect(deriveSlugBase('ahmed@example.com')).toBe('ahmed');
  });

  it('يحوّل النقاط والشرطات السفلية إلى شرطات', () => {
    expect(deriveSlugBase('ahmed.al_balushi@example.com')).toBe('ahmed-al-balushi');
  });

  it('يزيل الشرطات المتطرفة', () => {
    expect(deriveSlugBase('_ahmed_@example.com')).toBe('ahmed');
  });

  it('يستبدل الكلمات المحجوزة بأساس آمن', () => {
    expect(deriveSlugBase('admin@example.com')).toBe('admin-workspace');
    expect(deriveSlugBase('api@example.com')).toBe('api-workspace');
  });

  it('يستخدم بديلاً عندما لا يبقى شيء صالح', () => {
    // بريد بجزء محلي عربي بالكامل لا ينتج أحرفاً لاتينية
    expect(deriveSlugBase('أحمد@example.com')).toBe('workspace');
    expect(deriveSlugBase('a@example.com')).toBe('workspace');
  });

  it('يقصّ الأسماء الطويلة دون ترك شرطة في النهاية', () => {
    const result = deriveSlugBase(`${'a'.repeat(20)}-${'b'.repeat(20)}@example.com`);
    expect(result.length).toBeLessThanOrEqual(32);
    expect(result.endsWith('-')).toBe(false);
  });

  it('ينتج دائماً slug مطابقاً للصيغة المسموحة', () => {
    const inputs = ['ahmed@x.com', 'AHMED.99@x.com', '--weird--@x.com', 'أحمد@x.com'];
    for (const input of inputs) {
      expect(deriveSlugBase(input)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
