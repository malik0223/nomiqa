import { describe, expect, it } from 'vitest';
import { slugSchema, isReservedSlug } from '@nomiqa/validation';
import { SLUG_ALPHABET, SLUG_TOKEN_LENGTH, buildCardSlug, slugBase } from './card-slug.js';

describe('slugBase', () => {
  it('يشتق جزءاً مقروءاً من الاسم', () => {
    expect(slugBase('Salim Al Dhahli')).toBe('salim-al-dhahli');
  });

  it('يسقط إلى card حين لا يبقى من الاسم محرف لاتيني', () => {
    // اسم عربي بالكامل شائع هنا، ولا يصح أن ينتج رابطاً فارغاً.
    expect(slugBase('سالم الذهلي')).toBe('card');
    expect(slugBase('   ')).toBe('card');
  });

  it('لا يترك شرطة معلّقة بعد القص', () => {
    const base = slugBase(`${'a'.repeat(31)} bcdef`);
    expect(base.endsWith('-')).toBe(false);
  });
});

describe('buildCardSlug', () => {
  /**
   * الحارس الأهم: رابط بلا لاحقة يعني أن أول من يحمل اسماً يحصل على
   * `/salim-al-dhahli` — وهو ما يمكن تخمينه وعدّه.
   */
  it('يُلحق لاحقة عشوائية دائماً لا عند التعارض فقط', () => {
    const slug = buildCardSlug('Salim Al Dhahli');
    expect(slug).not.toBe('salim-al-dhahli');
    expect(slug).toMatch(
      new RegExp(`^salim-al-dhahli-[${SLUG_ALPHABET}]{${SLUG_TOKEN_LENGTH}}$`),
    );
  });

  it('ينتج رابطاً يقبله slugSchema', () => {
    for (const name of ['Salim Al Dhahli', 'سالم الذهلي', 'A', 'x'.repeat(120)]) {
      const slug = buildCardSlug(name);
      expect(slugSchema.safeParse(slug).success, `${name} → ${slug}`).toBe(true);
    }
  });

  it('لا ينتج كلمة محجوزة حتى حين يكون الاسم محجوزاً', () => {
    // `admin` كاسم كان سينتج `/admin` ويتعارض مع مسار في التطبيق.
    expect(isReservedSlug(buildCardSlug('admin'))).toBe(false);
  });

  it('لا يكرر نفسه عبر توليدات متتالية', () => {
    const slugs = new Set(Array.from({ length: 500 }, () => buildCardSlug('Same Name')));
    expect(slugs.size).toBe(500);
  });

  it('يستعمل أبجدية بلا محارف ملتبسة', () => {
    // الرابط يُملى في الهاتف ويُقرأ عن ورق مطبوع.
    for (const confusing of ['0', '1', 'i', 'l', 'o']) {
      expect(SLUG_ALPHABET).not.toContain(confusing);
    }
  });
});
