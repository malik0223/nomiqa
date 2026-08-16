import { describe, expect, it } from 'vitest';
import {
  extractPhone,
  organizationFromEmail,
  overallConfidence,
  parseBusinessCard,
} from './scan-card-text.js';

/**
 * التصنيف هو ما نختبره، لا قراءة الحروف.
 *
 * محرك التعرّف الضوئي خدمة خارجية بعقد ثابت: نصٌّ بأسطر. ما يخصّنا —
 * وما يفشل بلا أن يشتكي أحد — هو أي سطر يصير اسماً وأي سطر يصير مسمّى.
 * بطاقة تُقرأ حروفها كاملة ثم يوضع فيها «مدير المبيعات» في خانة الاسم
 * تنتج صفاً يُرسل إليه بريد باسم وظيفته.
 */
describe('parseBusinessCard', () => {
  it('يقرأ بطاقة عربية بسطور مختلطة', () => {
    const parsed = parseBusinessCard(
      [
        'سالم بن راشد الهنائي',
        'مدير تطوير الأعمال',
        'شركة الرمال للتقنية ش.م.م',
        'هاتف: 9123 4567',
        'salem@alrimal.om',
        'www.alrimal.om',
      ].join('\n'),
    );

    expect(parsed.fullName?.value).toBe('سالم بن راشد الهنائي');
    expect(parsed.jobTitle?.value).toBe('مدير تطوير الأعمال');
    expect(parsed.organizationName?.value).toBe('شركة الرمال للتقنية ش.م.م');
    expect(parsed.email?.value).toBe('salem@alrimal.om');
    expect(parsed.phone?.value).toBe('+96891234567');
    expect(parsed.website?.value).toBe('https://www.alrimal.om');
  });

  it('يقرأ بطاقة إنجليزية بصيغة دولية', () => {
    const parsed = parseBusinessCard(
      [
        'Fatma Al Balushi',
        'Chief Technology Officer',
        'Muscat Solutions LLC',
        'Mobile: +968 9876 5432',
        'fatma@muscatsolutions.com',
      ].join('\n'),
    );

    expect(parsed.fullName?.value).toBe('Fatma Al Balushi');
    expect(parsed.jobTitle?.value).toBe('Chief Technology Officer');
    expect(parsed.organizationName?.value).toBe('Muscat Solutions LLC');
    expect(parsed.phone?.value).toBe('+96898765432');
  });

  /**
   * الخلل الذي يبرر ترتيب الاستخراج كله.
   *
   * لو بُحث عن الاسم قبل استهلاك سطر المسمّى، لصار «Sales Manager» اسم
   * صاحب كل بطاقة لا تضع اسمها في أول سطر — وهي كثيرة: بطاقات تبدأ
   * بالشعار ثم المسمّى.
   */
  it('لا يجعل المسمّى الوظيفي اسماً حين يسبق الاسم', () => {
    const parsed = parseBusinessCard(['Sales Manager', 'Khalid Al Amri'].join('\n'));

    expect(parsed.jobTitle?.value).toBe('Sales Manager');
    expect(parsed.fullName?.value).toBe('Khalid Al Amri');
  });

  it('يشتق اسم المنشأة من نطاق البريد حين لا يُذكر صراحة', () => {
    const parsed = parseBusinessCard(['Aisha Al Kindi', 'aisha@nomiqa.om'].join('\n'));

    expect(parsed.organizationName?.value).toBe('Nomiqa');
    // الثقة المنخفضة ليست تفصيلاً: هي ما يجعل الشاشة تُبرز الحقل
    // ليراجعه الإنسان قبل الحفظ.
    expect(parsed.organizationName?.confidence).toBeLessThan(0.5);
  });

  it('لا يشتق منشأة من بريد عام', () => {
    const parsed = parseBusinessCard(['Aisha Al Kindi', 'aisha@gmail.com'].join('\n'));

    expect(parsed.organizationName).toBeUndefined();
  });

  it('يتجاهل السطور التي لا تشبه أسماء', () => {
    const parsed = parseBusinessCard(['P.O. Box 1234, Muscat 112', '+96824000000'].join('\n'));

    expect(parsed.fullName).toBeUndefined();
    expect(parsed.phone?.value).toBe('+96824000000');
  });

  it('يعيد صفراً حين لا يُستخرج شيء', () => {
    expect(overallConfidence(parseBusinessCard(''))).toBe(0);
  });
});

describe('extractPhone', () => {
  it('يقبل صيغة 00 الدولية', () => {
    expect(extractPhone('Tel: 00968 9123 4567')?.value).toBe('+96891234567');
  });

  it('يضيف رمز الدولة إلى الرقم المحلي', () => {
    expect(extractPhone('91234567')?.value).toBe('+96891234567');
  });

  it('يسقط الصفر البادئ قبل إضافة رمز الدولة', () => {
    expect(extractPhone('+971', '+971')).toBeNull();
    expect(extractPhone('0501234567', '+971')?.value).toBe('+971501234567');
  });

  /**
   * ما لا يُطبَّع يُعاد كما هو لا يُحذف: الرقم مكتوب على بطاقة بيد
   * صاحبها، وإسقاطه يجعل المراجع يبحث عنه في صورة حُذفت بعد الاستخراج.
   */
  it('يعيد الرقم غير القابل للتطبيع بثقة منخفضة', () => {
    const extracted = extractPhone('1234567');

    expect(extracted?.value).toBe('1234567');
    expect(extracted?.confidence).toBeLessThan(0.8);
  });

  it('يتجاهل السطر بلا أرقام كافية', () => {
    expect(extractPhone('Muscat, Oman')).toBeNull();
  });
});

describe('organizationFromEmail', () => {
  it('يفصل الكلمات على الشرطة', () => {
    expect(organizationFromEmail('a@alhajri-group.om')).toBe('Alhajri Group');
  });

  it('يرفض مزوّدي البريد العام', () => {
    for (const domain of ['gmail.com', 'hotmail.com', 'icloud.com', 'yahoo.co.uk']) {
      expect(organizationFromEmail(`a@${domain}`)).toBeNull();
    }
  });
});
