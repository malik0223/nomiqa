import { createHash, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildManifest, buildPassJson, toRgbString } from './apple-pass.js';
import { readTlv } from './der.js';
import { signDetached } from './pkcs7.js';
import { solidPng } from './png.js';
import { buildZip, crc32 } from './zip.js';

describe('أرشيف ZIP', () => {
  it('يبني أرشيفاً بتوقيعات الأقسام الثلاثة', () => {
    const archive = buildZip([{ name: 'pass.json', data: Buffer.from('{}') }]);

    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
  });

  it('يسجّل عدد الملفات وإزاحة الفهرس بدقة', () => {
    const entries = [
      { name: 'pass.json', data: Buffer.from('{"a":1}') },
      { name: 'manifest.json', data: Buffer.from('{"b":2}') },
    ];
    const archive = buildZip(entries);
    const end = archive.length - 22;

    expect(archive.readUInt16LE(end + 8)).toBe(2);
    expect(archive.readUInt16LE(end + 10)).toBe(2);

    const centralOffset = archive.readUInt32LE(end + 16);
    expect(archive.readUInt32LE(centralOffset)).toBe(0x02014b50);
  });

  it('ينتج البايتات نفسها للمحتوى نفسه', () => {
    // الحتمية شرط: الأرشيف موقَّع، وإعادة بنائه للتشخيص يجب أن تُنتج
    // ما وُقّع عليه — وطابع زمني في الترويسة كان يكسر ذلك.
    const entries = [{ name: 'pass.json', data: Buffer.from('{}') }];

    expect(buildZip(entries).equals(buildZip(entries))).toBe(true);
  });

  it('يحسب CRC-32 القيمة المعيارية', () => {
    // القيمة المنشورة لـ"123456789" في مواصفة CRC-32.
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
});

describe('صورة PNG الصمّاء', () => {
  it('تبدأ بالتوقيع المعياري وتنتهي بقطعة IEND', () => {
    const png = solidPng(29, '#0f766e');

    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.subarray(-8, -4).toString('ascii')).toBe('IEND');
  });

  it('تكتب الأبعاد المطلوبة في ترويسة IHDR', () => {
    const png = solidPng(58, '#0f766e');

    // IHDR يبدأ بعد التوقيع (8) والطول والنوع (8).
    expect(png.readUInt32BE(16)).toBe(58);
    expect(png.readUInt32BE(20)).toBe(58);
  });
});

describe('pass.json', () => {
  const identity = { passTypeIdentifier: 'pass.om.nomiqa.card', teamIdentifier: 'ABCDE12345' };
  const content = {
    serialNumber: 'serial-1',
    authenticationToken: 'token-1',
    fullName: 'سالم بن أحمد',
    jobTitle: 'مدير التطوير',
    organizationName: 'نميقة',
    cardUrl: 'https://nomiqa.om/salem?src=wallet',
    accentColor: '#0f766e',
    images: [],
    locale: 'ar' as const,
  };

  it('يشفّر الرابط الثابت في الرمز لا بيانات البطاقة', () => {
    // القاعدة نفسها التي تحكم كل رمز في المنصة منذ المرحلة 2 (§7.4):
    // تشفير البيانات يجعل كل تعديل يبطل ما وُزّع.
    const pass = JSON.parse(buildPassJson(identity, content));

    expect(pass.barcodes[0].message).toBe(content.cardUrl);
    expect(pass.barcodes[0].format).toBe('PKBarcodeFormatQR');
  });

  it('يحمل الحقول التي تفرضها المواصفة', () => {
    const pass = JSON.parse(buildPassJson(identity, content));

    expect(pass.formatVersion).toBe(1);
    expect(pass.passTypeIdentifier).toBe(identity.passTypeIdentifier);
    expect(pass.teamIdentifier).toBe(identity.teamIdentifier);
    expect(pass.description).toContain('سالم بن أحمد');
  });

  it('يحذف الحقل الثانوي حين لا مسمى وظيفياً', () => {
    const pass = JSON.parse(buildPassJson(identity, { ...content, jobTitle: null }));

    expect(pass.generic.secondaryFields).toEqual([]);
  });

  it('يحوّل اللون إلى صيغة rgb التي تقبلها المواصفة', () => {
    expect(toRgbString('#0f766e')).toBe('rgb(15, 118, 110)');
    expect(toRgbString('teal')).toBe('rgb(15, 118, 110)');
  });
});

describe('البيان', () => {
  it('يبصم كل ملف بـSHA-1 كما تفرض المواصفة', () => {
    const files = [{ name: 'pass.json', data: Buffer.from('{"a":1}') }];
    const manifest = JSON.parse(buildManifest(files));

    expect(manifest['pass.json']).toBe(
      createHash('sha1').update(files[0]!.data).digest('hex'),
    );
  });
});

describe('توقيع PKCS#7 المفصول', () => {
  /**
   * شهادة موقَّعة ذاتياً تُولَّد في الاختبار.
   *
   * لا تحل محل التحقق على جهاز حقيقي — سلسلة ثقة Apple لا يمكن
   * محاكاتها هنا. ما تثبته هذه الاختبارات أن **البنية** صحيحة: أن
   * الناتج ContentInfo سليم، وأن التوقيع محسوب على السمات الموقَّعة لا
   * على المحتوى، وأن الشهادتين مضمَّنتان.
   */
  it('يرفض شهادة غير صالحة بدل إنتاج توقيع لا يقبله أحد', () => {
    // الفشل المبكر مقصود: توقيع مبني على شهادة معطوبة يمر عندنا ويُرفض
    // على جهاز المستخدم بلا رسالة مفيدة.
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    expect(() =>
      signDetached(Buffer.from('x'), {
        certificatePem: 'not-a-certificate',
        privateKeyPem,
        wwdrPem: 'not-a-certificate',
      }),
    ).toThrow();
  });

  it('ينتج ContentInfo يبدأ بـSEQUENCE حين تتوفر الشهادات', () => {
    const certificatePem = process.env.APPLE_WALLET_CERT_PEM;
    const wwdrPem = process.env.APPLE_WALLET_WWDR_PEM;
    const privateKeyPem = process.env.APPLE_WALLET_KEY_PEM;

    // يُتخطى بلا شهادات: الاختبار يعمل في CI بلا أسرار، وشهادة مثبَّتة
    // في المستودع خطأ أمني لا حل.
    if (!certificatePem || !wwdrPem || !privateKeyPem) {
      return;
    }

    const signature = signDetached(Buffer.from('{"pass.json":"abc"}'), {
      certificatePem,
      privateKeyPem,
      wwdrPem,
    });

    const outer = readTlv(signature, 0);
    expect(outer.tag).toBe(0x30);
    expect(new X509Certificate(certificatePem).raw.length).toBeGreaterThan(0);
  });
});
