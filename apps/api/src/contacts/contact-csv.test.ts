import { describe, expect, it } from 'vitest';
import { buildContactsCsv } from './contact-csv.js';

type Row = Parameters<typeof buildContactsCsv>[0][number];

function contact(overrides: Partial<Row> = {}): Row {
  return {
    fullName: 'سالم الهنائي',
    email: 'salim@example.com',
    phone: '+96891234567',
    organizationName: null,
    jobTitle: null,
    source: 'card_form',
    followUpStatus: 'new',
    tags: [],
    cardSlug: 'demo-card',
    message: null,
    customFields: {},
    capturedAt: '2026-08-16T09:00:00.000Z',
    ...overrides,
  };
}

describe('تصدير جهات الاتصال', () => {
  it('يبدأ بعلامة ترتيب البايتات ليقرأ Excel العربية', () => {
    expect(buildContactsCsv([contact()]).startsWith('﻿')).toBe(true);
  });

  it('يقتبس القيم التي تحوي فاصلة أو سطراً جديداً', () => {
    const csv = buildContactsCsv([contact({ message: 'سطر أول\nسطر ثانٍ, ومعه فاصلة' })]);
    expect(csv).toContain('"سطر أول\nسطر ثانٍ, ومعه فاصلة"');
  });

  it('يضاعف علامة الاقتباس داخل القيمة', () => {
    const csv = buildContactsCsv([contact({ fullName: 'اسم "بينه" اقتباس' })]);
    expect(csv).toContain('"اسم ""بينه"" اقتباس"');
  });

  it('يحيّد الصيغ حتى لا تُنفَّذ في Excel', () => {
    // اسم يبدأ بـ= يصير صيغة تُنفَّذ عند فتح الملف. الزائر يكتب هذا
    // الحقل بنفسه، فالتصدير هو ناقل الهجوم إلى جهاز صاحب البطاقة.
    const csv = buildContactsCsv([contact({ fullName: '=HYPERLINK("http://evil.test")' })]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/);
  });

  it('يجمع أعمدة الحقول المخصصة من كل الصفوف', () => {
    const csv = buildContactsCsv([
      contact({ customFields: { event: 'معرض عُمان' } }),
      contact({ customFields: { budget: '5000' } }),
    ]);

    const header = csv.split('\r\n')[0]!;
    expect(header).toContain('custom_budget');
    expect(header).toContain('custom_event');
  });

  it('يترك خلية فارغة حين يغيب الحقل المخصص عن الصف', () => {
    const csv = buildContactsCsv([
      contact({ customFields: { event: 'معرض عُمان' } }),
      contact({ customFields: {} }),
    ]);

    const [header, , second] = csv.split('\r\n');
    expect(header!.split(',').length).toBe(second!.split(',').length);
  });

  it('يدمج أسماء التصنيفات في عمود واحد', () => {
    const csv = buildContactsCsv([
      contact({
        tags: [
          { id: '1', name: 'عميل محتمل', color: null },
          { id: '2', name: 'معرض', color: null },
        ],
      }),
    ]);

    expect(csv).toContain('عميل محتمل | معرض');
  });
});
