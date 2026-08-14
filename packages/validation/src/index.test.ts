import { describe, expect, it } from 'vitest';
import { consentSchema, phoneSchema, slugSchema, uploadRequestSchema } from './index.js';

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

describe('uploadRequestSchema', () => {
  const image = {
    purpose: 'avatar' as const,
    fileName: 'photo.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
  };

  it('يقبل صورة ضمن الحدود', () => {
    expect(uploadRequestSchema.safeParse(image).success).toBe(true);
  });

  it('يرفض نوعاً لا يناسب الغرض', () => {
    const result = uploadRequestSchema.safeParse({
      ...image,
      mimeType: 'application/pdf',
      fileName: 'cv.pdf',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['mimeType']);
  });

  it('يرفض تجاوز الحجم الأقصى للصور', () => {
    const result = uploadRequestSchema.safeParse({ ...image, sizeBytes: 6 * 1024 * 1024 });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['sizeBytes']);
  });

  it('يمنح المستندات حداً أعلى مستقلاً', () => {
    const result = uploadRequestSchema.safeParse({
      purpose: 'document',
      fileName: 'cv.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 8 * 1024 * 1024,
    });

    expect(result.success).toBe(true);
  });

  it('يرفض الأنواع التنفيذية صراحةً', () => {
    for (const mimeType of ['text/html', 'application/x-msdownload', 'image/svg+xml']) {
      expect(uploadRequestSchema.safeParse({ ...image, mimeType }).success).toBe(false);
    }
  });

  it('يرفض غرضاً غير معروف', () => {
    expect(uploadRequestSchema.safeParse({ ...image, purpose: 'anything' }).success).toBe(false);
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
