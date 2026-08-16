import { SHARE_CODE_LENGTH } from '@nomiqa/contracts';
import { normalizeShareCode, shareCodeSchema } from '@nomiqa/validation';
import { describe, expect, it } from 'vitest';
import { SHARE_CODE_ALPHABET, generateShareCode, shareUrl } from './share-code.js';

describe('توليد الكود القصير', () => {
  it('يلتزم بالطول والأبجدية المعلنين', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateShareCode();

      expect(code).toHaveLength(SHARE_CODE_LENGTH);
      expect([...code].every((character) => SHARE_CODE_ALPHABET.includes(character))).toBe(true);
    }
  });

  it('ينتج أكواداً يقبلها مخطط التحقق العام', () => {
    // العقد بين المولّد والمخطط ضمني، وكسره يظهر عند أول زائر لا عندنا.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      expect(shareCodeSchema.safeParse(generateShareCode()).success).toBe(true);
    }
  });

  it('لا يكرر كوداً في دفعة كبيرة', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateShareCode()));

    expect(codes.size).toBe(2000);
  });

  it('لا يستعمل الحروف الملتبسة إطلاقاً', () => {
    // شرط صحة التطبيع أدناه: لو ظهر أحدها في كود مولَّد لصار التصحيح
    // قادراً على تحويل كود صالح إلى كود صالح آخر — أي وسم يفتح بطاقة غيره.
    const codes = Array.from({ length: 3000 }, () => generateShareCode()).join('');

    expect(/[ilou]/.test(codes)).toBe(false);
  });
});

describe('تطبيع الكود المقروء', () => {
  it('يقبل اختلاف حالة الأحرف والمسافات الطرفية', () => {
    expect(normalizeShareCode('  7F3KP2QZ  ')).toBe('7f3kp2qz');
  });

  it('يصحّح الحروف الملتبسة بما يقابلها', () => {
    expect(normalizeShareCode('IL0OU')).toBe('1100v');
  });

  it('لا يغيّر كوداً صالحاً', () => {
    const code = generateShareCode();

    expect(normalizeShareCode(code)).toBe(code);
  });
});

describe('رابط المشاركة', () => {
  it('يحذف الشرطة الزائدة من الأصل', () => {
    expect(shareUrl('https://nomiqa.om/', 'abc12345')).toBe('https://nomiqa.om/t/abc12345');
  });
});
