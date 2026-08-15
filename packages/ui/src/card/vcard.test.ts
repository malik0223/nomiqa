import { describe, expect, it } from 'vitest';
import type { CardSnapshot } from '@nomiqa/contracts';
import { buildVCard, vCardFileName } from './vcard';

function snapshot(overrides: Partial<CardSnapshot> = {}): CardSnapshot {
  return {
    slug: 'salim',
    templateKey: 'classic',
    templateVersion: 1,
    defaultLocale: 'ar',
    theme: {},
    sectionOrder: [],
    content: {
      ar: {
        locale: 'ar',
        fullName: 'سالم الهنائي',
        jobTitle: 'مدير المنتج',
        organizationName: 'شركة، ومحدودة',
        department: 'المنتجات',
        bio: 'سطر\nثانٍ',
        addressLine: 'مسقط، عمان',
      },
      en: {
        locale: 'en',
        fullName: 'Salim Al Hinai',
        jobTitle: 'Product Manager',
        organizationName: null,
        department: null,
        bio: null,
        addressLine: null,
      },
    },
    links: [
      {
        id: '1',
        type: 'phone',
        platform: null,
        label: null,
        labelEn: null,
        value: '+96891234567',
        position: 0,
        isVisible: true,
        isPrimary: true,
      },
      {
        id: '2',
        type: 'website',
        platform: null,
        label: null,
        labelEn: null,
        value: 'https://example.com',
        position: 1,
        isVisible: true,
        isPrimary: false,
      },
    ],
    media: { avatarUrl: null, coverUrl: null, logoUrl: null },
    ...overrides,
  };
}

const options = { locale: 'ar', publicUrl: 'https://nomiqa.om/salim' };

describe('buildVCard', () => {
  it('ينتج ملفاً صالح البنية بأسطر CRLF', () => {
    const vcard = buildVCard(snapshot(), options);

    expect(vcard.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
    expect(vcard.endsWith('END:VCARD\r\n')).toBe(true);
  });

  it('يهرّب الفاصلة اللاتينية داخل اسم المؤسسة فلا تنقسم إلى حقلين', () => {
    const vcard = buildVCard(
      snapshot({
        content: {
          ar: {
            locale: 'ar',
            fullName: 'سالم الهنائي',
            jobTitle: null,
            organizationName: 'Nomiqa, LLC',
            department: 'المنتجات',
            bio: null,
            addressLine: null,
          },
        },
      }),
      options,
    );

    expect(vcard).toContain('ORG:Nomiqa\\, LLC;المنتجات');
  });

  it('لا يمس الفاصلة العربية — ليست محرفاً بنيوياً في vCard', () => {
    // ‎«،» ‏U+060C لا تفصل حقول vCard، وتهريبها يُظهر شرطة مائلة في
    // اسم المؤسسة داخل هاتف المستلم.
    expect(buildVCard(snapshot(), options)).toContain('ORG:شركة، ومحدودة;المنتجات');
  });

  it('يحوّل سطر النبذة الجديد إلى n\\ لا إلى سطر vCard جديد', () => {
    const vcard = buildVCard(snapshot(), options);

    expect(vcard).toContain('NOTE:سطر\\nثانٍ');
    expect(vcard.split('\r\n').filter((line) => line.startsWith('NOTE'))).toHaveLength(1);
  });

  it('يحفظ الهاتف كـTEL والموقع كـURL', () => {
    const vcard = buildVCard(snapshot(), options);

    expect(vcard).toContain('TEL;TYPE=CELL,VOICE:+96891234567');
    expect(vcard).toContain('URL:https://example.com');
  });

  it('يحفظ رقم واتساب كهاتف لا كرابط', () => {
    const vcard = buildVCard(
      snapshot({
        links: [
          {
            id: '1',
            type: 'whatsapp',
            platform: null,
            label: null,
            labelEn: null,
            value: '+96891234567',
            position: 0,
            isVisible: true,
            isPrimary: true,
          },
        ],
      }),
      options,
    );

    expect(vcard).toContain('TEL;TYPE=CELL:+96891234567');
    expect(vcard).not.toContain('URL:https://wa.me');
  });

  it('يستخدم اللغة المطلوبة ويسقط إلى الافتراضية عند غيابها', () => {
    expect(buildVCard(snapshot(), { ...options, locale: 'en' })).toContain('FN:Salim Al Hinai');
    expect(buildVCard(snapshot(), { ...options, locale: 'fr' })).toContain('FN:سالم الهنائي');
  });

  it('يضيف الرابط العام دائماً ليجد المستلم النسخة المحدَّثة', () => {
    expect(buildVCard(snapshot(), options)).toContain('URL;TYPE=PROFILE:https://nomiqa.om/salim');
  });

  it('لا يدرج رابطاً مخفياً — اللقطة لا تحمله أصلاً', () => {
    const vcard = buildVCard(snapshot({ links: [] }), options);

    expect(vcard).not.toContain('TEL');
  });
});

describe('vCardFileName', () => {
  it('يبني اسماً آمناً من الـslug', () => {
    expect(vCardFileName('salim-alhinai')).toBe('salim-alhinai.vcf');
  });

  it('يزيل أي محرف مسار', () => {
    expect(vCardFileName('../../etc/passwd')).toBe('etcpasswd.vcf');
  });
});
