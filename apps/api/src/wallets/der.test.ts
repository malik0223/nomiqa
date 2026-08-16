import { describe, expect, it } from 'vitest';
import {
  encode,
  integer,
  issuerAndSerial,
  oid,
  readTlv,
  sequence,
  setOf,
  TAG,
  utcTime,
} from './der.js';

const hex = (buffer: Buffer) => buffer.toString('hex');

describe('ترميز الطول', () => {
  it('يستخدم الصيغة القصيرة حتى 127 بايتاً', () => {
    expect(hex(encode(0x04, Buffer.alloc(3, 0xaa)))).toBe('0403aaaaaa');
    expect(encode(0x04, Buffer.alloc(127))[1]).toBe(127);
  });

  it('ينتقل إلى الصيغة الطويلة عند 128 فأكثر', () => {
    // 0x81 = بايت طول واحد يليه القيمة. الخطأ هنا يفسد كل بنية تحتوي
    // بياناً أكبر من 127 بايتاً — أي كل شهادة وكل توقيع.
    const long = encode(0x04, Buffer.alloc(128));
    expect(long[1]).toBe(0x81);
    expect(long[2]).toBe(128);

    const longer = encode(0x04, Buffer.alloc(300));
    expect(longer[1]).toBe(0x82);
    expect(longer.readUInt16BE(2)).toBe(300);
  });
});

describe('الأعداد الصحيحة', () => {
  it('ترمّز القيم الصغيرة ببايت واحد', () => {
    expect(hex(integer(1))).toBe('020101');
    expect(hex(integer(127))).toBe('02017f');
  });

  it('تضيف بايتاً صفرياً لمنع قراءة القيمة سالبة', () => {
    // DER أعداد بإشارة: 0x80 بلا بادئة يعني ‎-128 لا 128.
    expect(hex(integer(128))).toBe('02020080');
    expect(hex(integer(255))).toBe('020200ff');
  });

  it('ترمّز القيم متعددة البايتات بترتيب الشبكة', () => {
    expect(hex(integer(256))).toBe('02020100');
  });
});

describe('معرّفات الكائنات', () => {
  it('تدمج أول رقمين في بايت واحد', () => {
    // 1.2.840.113549.1.7.1 هو OID «data» في PKCS#7 — قيمة معيارية
    // منشورة، وهي أفضل ما يمكن التحقق منه بلا شبكة.
    expect(hex(oid('1.2.840.113549.1.7.1'))).toBe('06092a864886f70d010701');
  });

  it('ترمّز الأرقام الكبيرة بصيغة base-128', () => {
    expect(hex(oid('2.16.840.1.101.3.4.2.1'))).toBe('0609608648016503040201');
  });
});

describe('المجموعات', () => {
  it('ترتّب الأعضاء معجمياً كما تفرض DER', () => {
    // مجموعة غير مرتّبة تُنتج بايتات مختلفة عند إعادة الترميز، فيفشل
    // التحقق من التوقيع على جهاز المستخدم لا عندنا.
    const unsorted = setOf(encode(0x04, Buffer.from([0xff])), encode(0x04, Buffer.from([0x01])));

    expect(hex(unsorted)).toBe('31060401010401ff');
  });
});

describe('الوقت', () => {
  it('يرمّز UTCTime بصيغة YYMMDDHHMMSSZ', () => {
    const encoded = utcTime(new Date('2026-08-16T09:30:05Z'));

    expect(encoded[0]).toBe(TAG.UTC_TIME);
    expect(encoded.subarray(2).toString('ascii')).toBe('260816093005Z');
  });
});

describe('قراءة TLV', () => {
  it('تقرأ الصيغتين القصيرة والطويلة', () => {
    const short = encode(0x04, Buffer.alloc(5));
    expect(readTlv(short, 0)).toMatchObject({ tag: 0x04, valueLength: 5, end: 7 });

    const long = encode(0x04, Buffer.alloc(300));
    expect(readTlv(long, 0)).toMatchObject({ tag: 0x04, valueLength: 300 });
  });
});

describe('استخراج المُصدِر والرقم التسلسلي', () => {
  /**
   * شهادة مركّبة يدوياً بترتيب حقول TBSCertificate الحقيقي.
   *
   * تركيبها هنا بدل استيراد شهادة حقيقية: ما يُختبر هو **المشي في
   * البنية** لا صحة شهادة بعينها، وشهادة مثبَّتة في الاختبار تنتهي
   * صلاحيتها فيسقط الاختبار لسبب لا علاقة له بما يقيسه.
   */
  const buildCertificate = (withVersion: boolean) => {
    const version = encode(0xa0, integer(2));
    const serial = integer(0x1234);
    const signatureAlgorithm = sequence(oid('1.2.840.113549.1.1.11'));
    const issuer = sequence(encode(0x31, encode(0x30, Buffer.from([0x05, 0x00]))));
    const rest = encode(0x30, Buffer.alloc(4));

    const tbs = sequence(
      ...(withVersion ? [version] : []),
      serial,
      signatureAlgorithm,
      issuer,
      rest,
    );

    return { certificate: sequence(tbs, rest, encode(0x03, Buffer.alloc(2))), serial, issuer };
  };

  it('تتخطى وسم الإصدار الاختياري', () => {
    const { certificate, serial, issuer } = buildCertificate(true);
    const extracted = issuerAndSerial(certificate);

    expect(hex(extracted.serialNumber)).toBe(hex(serial));
    expect(hex(extracted.issuer)).toBe(hex(issuer));
  });

  it('تعمل على شهادة v1 بلا وسم إصدار', () => {
    const { certificate, serial, issuer } = buildCertificate(false);
    const extracted = issuerAndSerial(certificate);

    expect(hex(extracted.serialNumber)).toBe(hex(serial));
    expect(hex(extracted.issuer)).toBe(hex(issuer));
  });
});
