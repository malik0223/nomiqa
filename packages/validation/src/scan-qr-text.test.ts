import { describe, expect, it } from 'vitest';
import { parseScannedQr } from './scan-qr-text.js';

describe('parseScannedQr', () => {
  it('يقرأ vCard كاملة', () => {
    const { format, extracted } = parseScannedQr(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:الهنائي;سالم;;;',
        'FN:سالم الهنائي',
        'ORG:شركة الرمال للتقنية;قسم المبيعات',
        'TITLE:مدير المبيعات',
        'TEL;TYPE=CELL:+968 9123 4567',
        'EMAIL;TYPE=WORK:SALEM@ALRIMAL.OM',
        'URL:https://alrimal.om',
        'END:VCARD',
      ].join('\r\n'),
    );

    expect(format).toBe('vcard');
    expect(extracted.fullName?.value).toBe('سالم الهنائي');
    expect(extracted.organizationName?.value).toBe('شركة الرمال للتقنية');
    expect(extracted.jobTitle?.value).toBe('مدير المبيعات');
    expect(extracted.phone?.value).toBe('+96891234567');
    // البريد يُطبَّع صغيراً: المطابقة على التكرار تستخدم الشكل المطبَّع،
    // وحرف كبير واحد كان يجعل الشخص نفسه صفين.
    expect(extracted.email?.value).toBe('salem@alrimal.om');
  });

  it('يبني الاسم من N حين تغيب FN', () => {
    const { extracted } = parseScannedQr(
      ['BEGIN:VCARD', 'N:Al Balushi;Fatma;;;', 'END:VCARD'].join('\n'),
    );

    expect(extracted.fullName?.value).toBe('Fatma Al Balushi');
  });

  it('يقرأ MECARD', () => {
    const { format, extracted } = parseScannedQr(
      'MECARD:N:Al Amri,Khalid;TEL:+96899887766;EMAIL:k@example.om;ORG:Muscat Group;;',
    );

    expect(format).toBe('mecard');
    expect(extracted.fullName?.value).toBe('Khalid Al Amri');
    expect(extracted.phone?.value).toBe('+96899887766');
    expect(extracted.organizationName?.value).toBe('Muscat Group');
  });

  /**
   * رابط مجرد يبقى رابطاً.
   *
   * الإغراء هنا أن نفتح الرابط ونقرأ البطاقة خلفه. لا نفعل: ذلك يعني
   * أن خادمنا يزور موقعاً خارجياً بالنيابة عن المستخدم بمجرد أن يمسح
   * رمزاً — وهو رمز قد لا يكون بطاقة أصلاً.
   */
  it('يحفظ الرابط المجرد ولا يخترع له حقولاً', () => {
    const { format, extracted } = parseScannedQr('https://example.com/u/12345');

    expect(format).toBe('url');
    expect(extracted.website?.value).toBe('https://example.com/u/12345');
    expect(extracted.fullName).toBeUndefined();
  });

  it('يمرّر النص الحر على قارئ البطاقات', () => {
    const { format, extracted } = parseScannedQr('Fatma Al Balushi\nfatma@nomiqa.om');

    expect(format).toBe('text');
    expect(extracted.fullName?.value).toBe('Fatma Al Balushi');
    expect(extracted.email?.value).toBe('fatma@nomiqa.om');
  });
});
