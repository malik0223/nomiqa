import { describe, expect, it } from 'vitest';
import {
  cardLinkSchema,
  cardThemeSchema,
  createCardSchema,
  sectionOrderSchema,
  slugifyName,
  updateCardSchema,
} from './card.js';

function link(overrides: Record<string, unknown> = {}) {
  return { type: 'phone', value: '+96891234567', position: 0, ...overrides };
}

describe('cardLinkSchema', () => {
  it('يفرض صيغة E.164 على الهاتف وواتساب', () => {
    expect(cardLinkSchema.safeParse(link({ value: '91234567' })).success).toBe(false);
    expect(cardLinkSchema.safeParse(link({ type: 'whatsapp', value: '00968912' })).success).toBe(
      false,
    );
    expect(cardLinkSchema.safeParse(link()).success).toBe(true);
  });

  it('يزيل الفراغات والشرطات من الرقم قبل التخزين', () => {
    const parsed = cardLinkSchema.parse(link({ value: '+968 9123 4567' }));

    expect(parsed.value).toBe('+96891234567');
  });

  it('يرفض قيمة ليست بريداً في رابط البريد', () => {
    expect(cardLinkSchema.safeParse(link({ type: 'email', value: 'salim' })).success).toBe(false);
  });

  it('يضيف https حين يكتب المستخدم النطاق وحده', () => {
    const parsed = cardLinkSchema.parse(link({ type: 'website', value: 'example.com' }));

    expect(parsed.value).toBe('https://example.com');
  });

  it('يرفض المخططات الخطرة', () => {
    // javascript: تمر من فحص «يحتوي نقطتين» الساذج، وتنتهي في href.
    expect(
      cardLinkSchema.safeParse(link({ type: 'website', value: 'javascript:alert(1)' })).success,
    ).toBe(false);
    expect(
      cardLinkSchema.safeParse(link({ type: 'custom', value: 'data:text/html,<script>' })).success,
    ).toBe(false);
  });

  it('يشترط المنصة للرابط الاجتماعي', () => {
    expect(
      cardLinkSchema.safeParse(link({ type: 'social', value: 'https://x.com/nomiqa' })).success,
    ).toBe(false);
    expect(
      cardLinkSchema.safeParse(
        link({ type: 'social', platform: 'x', value: 'https://x.com/nomiqa' }),
      ).success,
    ).toBe(true);
  });
});

describe('updateCardSchema', () => {
  it('يشترط الإصدار', () => {
    expect(updateCardSchema.safeParse({ defaultLocale: 'ar' }).success).toBe(false);
  });

  it('يرفض طلباً لا يحمل إلا الإصدار', () => {
    expect(updateCardSchema.safeParse({ revision: 3 }).success).toBe(false);
  });

  it('يرفض الحقول الزائدة — منعاً لـMass Assignment', () => {
    const result = updateCardSchema.safeParse({
      revision: 1,
      defaultLocale: 'ar',
      organizationId: '00000000-0000-0000-0000-000000000000',
    });

    expect(result.success).toBe(false);
  });

  it('يرفض تكرار اللغة في المحتوى', () => {
    const result = updateCardSchema.safeParse({
      revision: 1,
      content: [
        { locale: 'ar', fullName: 'سالم' },
        { locale: 'ar', fullName: 'سالم آخر' },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('يحوّل النص الفارغ إلى null لا إلى فراغ', () => {
    const result = updateCardSchema.parse({
      revision: 1,
      content: [{ locale: 'ar', fullName: 'سالم الهنائي', jobTitle: '' }],
    });

    expect(result.content?.[0]?.jobTitle).toBeNull();
  });
});

describe('createCardSchema', () => {
  it('يستخدم القالب واللغة الافتراضيين', () => {
    const parsed = createCardSchema.parse({ fullName: 'سالم الهنائي' });

    expect(parsed.templateKey).toBe('classic');
    expect(parsed.defaultLocale).toBe('ar');
  });

  it('يرفض الرابط المحجوز', () => {
    expect(createCardSchema.safeParse({ fullName: 'سالم', slug: 'dashboard' }).success).toBe(false);
    // مقاطع المرحلة 2 محجوزة أيضاً وإلا صادر slug مسار qr أو vcard.
    expect(createCardSchema.safeParse({ fullName: 'سالم', slug: 'qr' }).success).toBe(false);
  });
});

describe('cardThemeSchema', () => {
  it('يقبل اللون السداسي فقط', () => {
    expect(cardThemeSchema.safeParse({ primaryColor: '#0F766E' }).success).toBe(true);
    expect(cardThemeSchema.safeParse({ primaryColor: 'teal' }).success).toBe(false);
  });
});

describe('sectionOrderSchema', () => {
  it('يرفض تكرار القسم', () => {
    expect(sectionOrderSchema.safeParse(['identity', 'identity']).success).toBe(false);
  });
});

describe('slugifyName', () => {
  it('يشتق رابطاً من الاسم اللاتيني', () => {
    expect(slugifyName('Salim Al Hinai')).toBe('salim-al-hinai');
  });

  it('يزيل التشكيل اللاتيني', () => {
    expect(slugifyName('José Álvarez')).toBe('jose-alvarez');
  });

  it('يعيد نصاً فارغاً للاسم العربي بدل نقحرة مخمَّنة', () => {
    // الرابط لاتيني فقط (§7.4)، والنقحرة التلقائية تنتج روابط لا
    // يتعرف عليها صاحبها — يعالجه المستدعي باحتياط صريح.
    expect(slugifyName('سالم الهنائي')).toBe('');
  });
});
