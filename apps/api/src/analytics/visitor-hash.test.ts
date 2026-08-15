import { describe, expect, it } from 'vitest';
import { deviceTypeOf, referrerHostOf, visitorHash } from './visitor-hash.js';

const base = {
  secret: 'test-secret',
  ipAddress: '10.0.0.1',
  userAgent: 'Mozilla/5.0',
  slug: 'demo-card',
  at: new Date('2026-08-16T10:00:00Z'),
};

describe('تجزئة الزائر', () => {
  it('تعطي القيمة نفسها لنفس الزائر في اليوم نفسه', () => {
    const first = visitorHash(base);
    const second = visitorHash({ ...base, at: new Date('2026-08-16T23:59:00Z') });

    expect(second).toBe(first);
  });

  it('تتغير عند تغيّر اليوم فلا يُتتبَّع الزائر عبر الأيام', () => {
    // هذا ما يجعل «الزائر الفريد» مقياساً يومياً لا معرّفاً دائماً.
    const next = visitorHash({ ...base, at: new Date('2026-08-17T00:01:00Z') });

    expect(next).not.toBe(visitorHash(base));
  });

  it('تتغير بين بطاقتين فلا تُربط زيارات الشخص عبرهما', () => {
    expect(visitorHash({ ...base, slug: 'other-card' })).not.toBe(visitorHash(base));
  });

  it('تميّز زائرين مختلفين على البطاقة نفسها', () => {
    expect(visitorHash({ ...base, ipAddress: '10.0.0.2' })).not.toBe(visitorHash(base));
  });

  it('تتغير بتغيّر المفتاح السرّي', () => {
    expect(visitorHash({ ...base, secret: 'another' })).not.toBe(visitorHash(base));
  });
});

describe('نوع الجهاز', () => {
  it('يميّز الهاتف', () => {
    expect(deviceTypeOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148')).toBe('mobile');
    expect(deviceTypeOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari')).toBe('mobile');
  });

  it('يميّز اللوحي', () => {
    expect(deviceTypeOf('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet');
    // أندرويد بلا Mobile يعني لوحياً — القاعدة التي توثّقها جوجل نفسها.
    expect(deviceTypeOf('Mozilla/5.0 (Linux; Android 14) Safari')).toBe('tablet');
  });

  it('يعتبر ما عدا ذلك سطح مكتب', () => {
    expect(deviceTypeOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
  });
});

describe('نطاق المُحيل', () => {
  it('يُبقي النطاق ويُسقط المسار والاستعلام', () => {
    // المسار قد يحمل رمز حملة أو معرّف جلسة في منصة أخرى.
    expect(referrerHostOf('https://www.linkedin.com/feed/?token=abc')).toBe('www.linkedin.com');
  });

  it('يُرجع null لقيمة غير صالحة أو غائبة', () => {
    expect(referrerHostOf(undefined)).toBeNull();
    expect(referrerHostOf('ليس رابطاً')).toBeNull();
  });
});
