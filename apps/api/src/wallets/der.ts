/**
 * ترميز DER الأدنى اللازم لتوقيع PKCS#7.
 *
 * لماذا بلا مكتبة: التوقيع المفصول الذي تطلبه Apple Wallet يحتاج بنية
 * `SignedData` واحدة بحقول ثابتة، والمكتبات التي تولّدها تجرّ معها
 * محلّل ASN.1 عاماً بمساحة هجوم أوسع بكثير من هذه المئتي سطر — على
 * مسار يعالج شهادات ومفاتيح.
 *
 * والقيد الذي يجعل ذلك آمناً: **لا شيء هنا يحلّل مدخلاً غير موثوق**.
 * ما يُرمَّز بيانات نولّدها نحن، وما يُحلَّل شهادة يضعها مسؤول المنصة
 * في متغير بيئة. لا مسار من طلب مستخدم إلى هذه الدوال.
 */

// ---------------------------------------------------------------
// الترميز
// ---------------------------------------------------------------

export const TAG = {
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTC_TIME: 0x17,
  SEQUENCE: 0x30,
  SET: 0x31,
} as const;

/**
 * يبني عنصر TLV واحداً.
 *
 * الطول بالصيغة القصيرة حتى 127 وبالطويلة بعدها، وهو ما تفرضه DER —
 * وBER تسمح بغيره. الفرق مهم: التوقيع يُحسب على البايتات، فترميز طول
 * مختلف عن المتوقَّع يعني توقيعاً لا يتحقق منه أحد.
 */
export function encode(tag: number, value: Buffer): Buffer {
  if (value.length < 0x80) {
    return Buffer.concat([Buffer.from([tag, value.length]), value]);
  }

  const lengthBytes: number[] = [];
  let remaining = value.length;

  while (remaining > 0) {
    lengthBytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }

  return Buffer.concat([
    Buffer.from([tag, 0x80 | lengthBytes.length, ...lengthBytes]),
    value,
  ]);
}

export function sequence(...items: Buffer[]): Buffer {
  return encode(TAG.SEQUENCE, Buffer.concat(items));
}

/**
 * يبني `SET OF`.
 *
 * الترتيب المعجمي لترميزات الأعضاء شرط في DER لا تجميل: المتحقِّق يعيد
 * الترميز ويقارنه بما وقّعناه، ومجموعة غير مرتبة تُنتج بايتات مختلفة
 * فيفشل التحقق على جهاز المستخدم لا عندنا.
 */
export function setOf(...items: Buffer[]): Buffer {
  const sorted = [...items].sort(Buffer.compare);
  return encode(TAG.SET, Buffer.concat(sorted));
}

/** وسم سياقي صريح — يغلّف المحتوى بوسم إضافي. */
export function explicit(index: number, value: Buffer): Buffer {
  return encode(0xa0 | index, value);
}

/** وسم سياقي ضمني — يستبدل وسم المحتوى ولا يغلّفه. */
export function implicitConstructed(index: number, value: Buffer): Buffer {
  return encode(0xa0 | index, value);
}

export function integer(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = value;

  do {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  } while (remaining > 0);

  // بايت صفري أمام قيمة بتّها الأعلى مضبوط: DER أعداد صحيحة بإشارة،
  // و0x80 بلا بادئة يُقرأ سالباً.
  if ((bytes[0]! & 0x80) !== 0) {
    bytes.unshift(0);
  }

  return encode(TAG.INTEGER, Buffer.from(bytes));
}

export function octetString(value: Buffer): Buffer {
  return encode(TAG.OCTET_STRING, value);
}

export function nullValue(): Buffer {
  return encode(TAG.NULL, Buffer.alloc(0));
}

/** معرّف كائن من صيغته النقطية. */
export function oid(dotted: string): Buffer {
  const parts = dotted.split('.').map(Number);
  const bytes: number[] = [parts[0]! * 40 + parts[1]!];

  for (const part of parts.slice(2)) {
    const chunk: number[] = [part & 0x7f];
    let remaining = part >>> 7;

    while (remaining > 0) {
      chunk.unshift((remaining & 0x7f) | 0x80);
      remaining >>>= 7;
    }

    bytes.push(...chunk);
  }

  return encode(TAG.OID, Buffer.from(bytes));
}

/** وقت UTC بصيغة YYMMDDHHMMSSZ — الصيغة الوحيدة التي تقبلها DER. */
export function utcTime(date: Date): Buffer {
  const pad = (value: number) => String(value).padStart(2, '0');

  const text = [
    pad(date.getUTCFullYear() % 100),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z',
  ].join('');

  return encode(TAG.UTC_TIME, Buffer.from(text, 'ascii'));
}

/** معرّف خوارزمية بمعامل NULL — ما تتوقعه أدوات التحقق لـSHA-256 وRSA. */
export function algorithmIdentifier(algorithmOid: string): Buffer {
  return sequence(oid(algorithmOid), nullValue());
}

// ---------------------------------------------------------------
// التحليل
// ---------------------------------------------------------------

export interface Tlv {
  tag: number;
  /** بداية المحتوى داخل المخزن الأصلي. */
  valueStart: number;
  valueLength: number;
  /** نهاية العنصر كاملاً — بداية العنصر التالي. */
  end: number;
}

/** يقرأ عنصر TLV واحداً من موضع محدد. */
export function readTlv(buffer: Buffer, offset: number): Tlv {
  const tag = buffer[offset];

  if (tag === undefined) {
    throw new Error('بنية DER مقطوعة');
  }

  const first = buffer[offset + 1];

  if (first === undefined) {
    throw new Error('بنية DER مقطوعة');
  }

  if ((first & 0x80) === 0) {
    return { tag, valueStart: offset + 2, valueLength: first, end: offset + 2 + first };
  }

  const lengthSize = first & 0x7f;
  let length = 0;

  for (let index = 0; index < lengthSize; index += 1) {
    length = length * 256 + (buffer[offset + 2 + index] ?? 0);
  }

  const valueStart = offset + 2 + lengthSize;
  return { tag, valueStart, valueLength: length, end: valueStart + length };
}

/** يستخرج العنصر كاملاً بوسمه وطوله — ما يلزم لإعادة إدراجه كما هو. */
export function sliceTlv(buffer: Buffer, offset: number): Buffer {
  const tlv = readTlv(buffer, offset);
  return buffer.subarray(offset, tlv.end);
}

/**
 * يستخرج `issuer` و`serialNumber` من شهادة X.509.
 *
 * الاثنان هما `IssuerAndSerialNumber` الذي يعرّف الموقّع داخل
 * `SignerInfo`، ويجب أن يُدرجا **ببايتاتهما الأصلية** لا بإعادة بنائهما
 * من نص: أي اختلاف في ترميز حرف واحد في اسم الجهة المُصدِرة يجعل
 * الجهاز يبحث عن شهادة لا يجدها.
 *
 * ترتيب حقول `TBSCertificate` ثابت في المواصفة:
 *   [0] version (اختياري) → serialNumber → signature → issuer → …
 */
export function issuerAndSerial(certificateDer: Buffer): {
  issuer: Buffer;
  serialNumber: Buffer;
} {
  const certificate = readTlv(certificateDer, 0);
  const tbs = readTlv(certificateDer, certificate.valueStart);

  let cursor = tbs.valueStart;

  // رقم الإصدار موسوم سياقياً [0]؛ غيابه يعني v1 ويبدأ الرقم التسلسلي مباشرة.
  if (certificateDer[cursor] === 0xa0) {
    cursor = readTlv(certificateDer, cursor).end;
  }

  const serialNumber = sliceTlv(certificateDer, cursor);
  cursor = readTlv(certificateDer, cursor).end;

  // خوارزمية التوقيع — تُتخطى.
  cursor = readTlv(certificateDer, cursor).end;

  const issuer = sliceTlv(certificateDer, cursor);

  return { issuer, serialNumber };
}
