import { SIGNATURE_TEMPLATES } from '@nomiqa/contracts';
import { describe, expect, it } from 'vitest';
import {
  cssColor,
  escapeHtml,
  renderSignature,
  safeUrl,
  type SignatureSource,
} from './signature-render.js';

const base: SignatureSource = {
  fullName: 'سالم بن أحمد',
  jobTitle: 'مدير التطوير',
  organizationName: 'نميقة',
  department: 'الهندسة',
  phone: '+96891234567',
  email: 'salem@nomiqa.om',
  website: 'https://nomiqa.om',
  socialLinks: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/salem' }],
  avatarUrl: 'https://cdn.nomiqa.om/avatar.png',
  logoUrl: 'https://cdn.nomiqa.om/logo.png',
  cardUrl: 'https://nomiqa.om/salem?src=signature',
  qrUrl: 'https://nomiqa.om/c/salem/qr?format=png&src=signature',
  accentColor: '#0f766e',
  direction: 'rtl',
  disclaimer: null,
  labels: {
    viewCard: 'بطاقتي الرقمية',
    phone: 'هاتف',
    email: 'بريد',
    website: 'موقع',
  },
};

describe('توليد التوقيع', () => {
  it('يبني كل قالب بمحتوى البطاقة ورابطها', () => {
    for (const template of SIGNATURE_TEMPLATES) {
      const { html, text } = renderSignature(template, base);

      expect(html).toContain('سالم بن أحمد');
      expect(html).toContain('https://nomiqa.om/salem?src=signature');
      expect(text).toContain('سالم بن أحمد');
    }
  });

  it('لا يستخدم إلا تخطيط الجداول والأنماط السطرية', () => {
    // Outlook على ويندوز يعرض عبر محرك Word: لا Flexbox ولا Grid،
    // وGmail يحذف كل <style>. أي واحد منها يعني توقيعاً منهاراً عند
    // المتلقي وسليماً عند المرسل — أسوأ عطل ممكن في هذه الميزة.
    for (const template of SIGNATURE_TEMPLATES) {
      const { html } = renderSignature(template, base);

      expect(html).not.toContain('<style');
      expect(html).not.toContain('display:flex');
      expect(html).not.toContain('display:grid');
      expect(html).not.toContain('class=');
      expect(html).not.toContain('<script');
    }
  });

  it('يعطي كل صورة عرضاً وارتفاعاً صريحين', () => {
    const { html } = renderSignature('classic', base);

    expect(html).toMatch(/<img [^>]*width="64"[^>]*height="64"/);
  });

  it('يهرّب محتوى البطاقة فلا يُحقن وسم في رسالة طرف ثالث', () => {
    const { html } = renderSignature('classic', {
      ...base,
      fullName: '<script>alert(1)</script>',
      jobTitle: 'مدير " onmouseover="x',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    // الاقتباس المهرَّب هو المهم لا اختفاء الكلمة: `onmouseover` نصاً
    // عادياً غير ضار، والضار أن يغلق اقتباسٌ سمةً فيصير ما بعده سمة.
    expect(html).not.toContain('" onmouseover="');
    expect(html).toContain('&quot; onmouseover=&quot;');
  });

  it('يستبدل الروابط الخطرة بمرساة معطّلة', () => {
    const { html } = renderSignature('compact', {
      ...base,
      cardUrl: 'javascript:alert(1)',
    });

    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('يتجاهل لوناً غير صالح بدل إدراجه في النمط', () => {
    const { html } = renderSignature('banner', {
      ...base,
      accentColor: '#fff;position:fixed;top:0',
    });

    expect(html).not.toContain('position:fixed');
  });

  it('يحذف الأقسام التي لا بيانات لها بدل ترك فراغ', () => {
    const { html, text } = renderSignature('classic', {
      ...base,
      avatarUrl: null,
      qrUrl: null,
      phone: null,
      socialLinks: [],
    });

    expect(html).not.toContain('<img');
    expect(text).not.toContain('هاتف');
  });

  it('يضيف إخلاء المسؤولية حين يُضبط', () => {
    const { html, text } = renderSignature('classic', {
      ...base,
      disclaimer: 'هذه الرسالة سرّية.',
    });

    expect(html).toContain('هذه الرسالة سرّية.');
    expect(text).toContain('هذه الرسالة سرّية.');
  });

  it('يثبّت اتجاه الأرقام إلى LTR داخل توقيع عربي', () => {
    // ‎+968… في سياق RTL يُعرض معكوساً فيصير رقماً آخر.
    const { html } = renderSignature('classic', base);

    expect(html).toMatch(/dir="ltr"[^>]*>\s*<a[^>]*tel:/);
  });
});

describe('لبنات التنقية', () => {
  it('تهرّب المحارف الخمسة الخطرة', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('تقبل المخططات الآمنة وحدها', () => {
    expect(safeUrl('https://nomiqa.om')).toBe('https://nomiqa.om');
    expect(safeUrl('mailto:a@b.om')).toBe('mailto:a@b.om');
    expect(safeUrl('tel:+96891234567')).toBe('tel:+96891234567');
    expect(safeUrl('data:text/html,<h1>x')).toBe('#');
    expect(safeUrl('  JavaScript:alert(1)')).toBe('#');
  });

  it('تسقط إلى اللون الافتراضي عند قيمة غير سليمة', () => {
    expect(cssColor('#0f766e')).toBe('#0f766e');
    expect(cssColor('red')).toBe('#0f766e');
    expect(cssColor('#fff')).toBe('#0f766e');
  });
});
