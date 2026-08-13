import { describe, expect, it } from 'vitest';
import { consentSchema, phoneSchema, slugSchema } from './index.js';

describe('slugSchema', () => {
  it('يقبل رابطاً صالحاً', () => {
    expect(slugSchema.parse('ahmed-al-balushi')).toBe('ahmed-al-balushi');
  });

  it('يرفض الكلمات المحجوزة', () => {
    expect(slugSchema.safeParse('admin').success).toBe(false);
    expect(slugSchema.safeParse('api').success).toBe(false);
  });

  it('يرفض الأحرف غير المسموحة والشرطات المتطرفة', () => {
    expect(slugSchema.safeParse('أحمد').success).toBe(false);
    expect(slugSchema.safeParse('-ahmed').success).toBe(false);
    expect(slugSchema.safeParse('ahmed--x').success).toBe(false);
  });
});

describe('phoneSchema', () => {
  it('يقبل صيغة E.164', () => {
    expect(phoneSchema.parse('+96891234567')).toBe('+96891234567');
  });

  it('يرفض الأرقام المحلية بدون رمز الدولة', () => {
    expect(phoneSchema.safeParse('91234567').success).toBe(false);
  });
});

describe('consentSchema', () => {
  it('يشترط موافقة التواصل صراحةً', () => {
    expect(
      consentSchema.safeParse({ contactConsent: false, consentTextVersion: 'v1' }).success,
    ).toBe(false);
  });

  it('يفصل الموافقة التسويقية ويجعلها اختيارية', () => {
    const result = consentSchema.parse({ contactConsent: true, consentTextVersion: 'v1' });
    expect(result.marketingConsent).toBe(false);
  });
});
