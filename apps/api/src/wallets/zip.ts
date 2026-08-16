/**
 * كاتب أرشيف ZIP بلا ضغط.
 *
 * حزمة `.pkpass` أرشيف ZIP عادي، ومحتواه بضعة كيلوبايتات من JSON
 * وصورتين. الضغط عليها يوفّر أقل مما يكلّف، ويجرّ اعتمادية `zlib`
 * بإعدادات تختلف نتائجها بين إصدارات Node — وناتج غير حتمي في ملف
 * موقَّع مشكلة لا مزية.
 *
 * التخزين المباشر (method 0) يجعل الأرشيف قابلاً للبناء في ثلاثين
 * سطراً وحتمياً بالكامل، وiOS يقبله بلا تحفّظ.
 */

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_SIGNATURE = 0x06054b50;

/** يبني أرشيفاً من مدخلات مرتّبة. الترتيب يحدد ترتيب الملفات في الأرشيف. */
export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    local.writeUInt16LE(20, 4); // أدنى إصدار لازم للاستخراج
    local.writeUInt16LE(0, 6); // بلا رايات
    local.writeUInt16LE(0, 8); // بلا ضغط
    // وقت وتاريخ صفريان: الأرشيف يجب أن يكون حتمياً — ملفان بمحتوى
    // واحد يجب أن ينتجا بايتات واحدة، وإلا تعذّر التحقق من إعادة البناء.
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // بلا حقول إضافية

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, entry.data);
    centrals.push(central, name);

    offset += local.length + name.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centrals);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_SIGNATURE, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDirectory, end]);
}

/** جدول CRC-32 يُبنى مرة واحدة عند التحميل. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

export function crc32(data: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
