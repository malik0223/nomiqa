import { describe, expect, it } from 'vitest';
import type { CardLinkData } from '@nomiqa/contracts';
import { linkLabel, normalizeUrl, toHref, visibleLinks } from './link-utils';

function link(overrides: Partial<CardLinkData>): CardLinkData {
  return {
    id: 'id',
    type: 'custom',
    value: 'example.com',
    position: 0,
    isVisible: true,
    isPrimary: false,
    ...overrides,
  };
}

describe('toHref', () => {
  it('يبني tel: ويزيل المسافات', () => {
    expect(toHref(link({ type: 'phone', value: '+968 9123 4567' }))).toBe('tel:+96891234567');
  });

  it('يبني mailto:', () => {
    expect(toHref(link({ type: 'email', value: 'a@b.com' }))).toBe('mailto:a@b.com');
  });

  it('يبني رابط واتساب بأرقام فقط', () => {
    // wa.me لا يقبل + ولا فواصل
    expect(toHref(link({ type: 'whatsapp', value: '+968 9123 4567' }))).toBe(
      'https://wa.me/96891234567',
    );
  });

  it('يضيف https للنطاق المجرد', () => {
    expect(toHref(link({ type: 'website', value: 'nomiqa.om' }))).toBe('https://nomiqa.om');
  });

  it('يبقي البروتوكول الموجود', () => {
    expect(toHref(link({ type: 'website', value: 'http://nomiqa.om' }))).toBe('http://nomiqa.om');
  });
});

describe('normalizeUrl', () => {
  it('يتجاهل المسافات الطرفية', () => {
    expect(normalizeUrl('  nomiqa.om  ')).toBe('https://nomiqa.om');
  });
});

describe('linkLabel', () => {
  it('يفضّل التسمية الإنجليزية في الإنجليزية', () => {
    expect(linkLabel(link({ label: 'اتصل', labelEn: 'Call me' }), 'en')).toBe('Call me');
  });

  it('يسقط إلى التسمية العربية عند غياب الإنجليزية', () => {
    expect(linkLabel(link({ label: 'اتصل' }), 'en')).toBe('اتصل');
  });

  it('يستخدم تسمية افتراضية حسب النوع واللغة', () => {
    expect(linkLabel(link({ type: 'whatsapp' }), 'ar')).toBe('واتساب');
    expect(linkLabel(link({ type: 'whatsapp' }), 'en')).toBe('WhatsApp');
  });

  it('يستخدم اسم المنصة للروابط الاجتماعية', () => {
    expect(linkLabel(link({ type: 'social', platform: 'linkedin' }), 'ar')).toBe('Linkedin');
  });
});

describe('visibleLinks', () => {
  it('يخفي غير المرئية ويرتب بالموضع لا بترتيب الإدراج', () => {
    const result = visibleLinks([
      link({ id: 'c', position: 2 }),
      link({ id: 'hidden', position: 0, isVisible: false }),
      link({ id: 'a', position: 0 }),
      link({ id: 'b', position: 1 }),
    ]);

    expect(result.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});
