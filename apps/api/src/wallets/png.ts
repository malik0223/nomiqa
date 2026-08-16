import { deflateSync } from 'node:zlib';
import { crc32 } from './zip.js';

/**
 * مولّد PNG بلون واحد.
 *
 * Apple Wallet ترفض الحزمة بلا `icon.png` و`icon@2x.png`، ولا تقبل SVG.
 * والصور المطلوبة مربّعات صغيرة بلون المؤسسة — لا صور فوتوغرافية.
 *
 * ولذلك مولّد بأربعين سطراً بدل مكتبة معالجة صور: `sharp` وأمثالها
 * ثنائيات أصلية تُبنى لكل معمارية، ودخولها في صورة الحاوية لأجل مربّع
 * ملوّن كلفةٌ لا تُبرَّر.
 *
 * صورة صاحب البطاقة **لا تدخل الحزمة عمداً**: البطاقة في المحفظة
 * محتواها متجمّد عند لحظة الإصدار، وصورة قديمة في جيب المتلقي أسوأ من
 * لا صورة. الصورة الحالية تظهر عند فتح الرابط.
 */

/** يبني صورة مربّعة صمّاء بحجم وبلون محددين. */
export function solidPng(size: number, hexColor: string): Buffer {
  const { red, green, blue } = parseHex(hexColor);

  // كل سطر مسبوق ببايت نوع المرشّح (0 = بلا مرشّح): جزء من صيغة PNG
  // لا من بياناتنا، وإغفاله يجعل الصورة تُقرأ منحرفة قطرياً.
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);

  for (let row = 0; row < size; row += 1) {
    const start = row * stride;
    raw[start] = 0;

    for (let column = 0; column < size; column += 1) {
      const offset = start + 1 + column * 3;
      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // عمق البت لكل قناة
  header[9] = 2; // نوع اللون: RGB بلا شفافية
  header[10] = 0; // الضغط: deflate — القيمة الوحيدة المعرَّفة
  header[11] = 0; // المرشّح: القياسي
  header[12] = 0; // بلا تشابك

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * قطعة PNG: طول، نوع، بيانات، ثم CRC على النوع والبيانات معاً.
 *
 * الـCRC هي نفسها المستخدمة في ZIP — نفس المتعددة ونفس الجدول — فتُقرأ
 * من هناك بدل جدول ثانٍ يختلف عنه بصمت.
 */
function chunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function parseHex(value: string): { red: number; green: number; blue: number } {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  const numeric = match ? parseInt(match[1]!, 16) : 0x0f766e;

  return {
    red: (numeric >> 16) & 255,
    green: (numeric >> 8) & 255,
    blue: numeric & 255,
  };
}
