import QRCode from 'qrcode';
import { slugSchema } from '@nomiqa/validation';
import { fetchPublicCard, publicCardUrl } from '../../../../lib/cards';

/**
 * رمز QR للبطاقة.
 *
 * القاعدة الحاكمة (§7.4، وبوابة خروج المرحلة 2): **الرمز يشفّر الرابط
 * الثابت لا محتوى البطاقة**. لو شفّرنا البيانات لصار كل تعديل يستوجب
 * إعادة طباعة كل ما طُبع — وهي بالضبط المشكلة التي وُجدت المنصة لحلها.
 *
 * ولذلك أيضاً لا يتغير الناتج بتغيّر البطاقة، فيُخزَّن طويلاً.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;

  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) {
    return new Response('Not found', { status: 404 });
  }

  // لا نصدر رمزاً لبطاقة غير منشورة: الرمز المطبوع يعيش أطول من
  // المسودة، وإصداره قبل النشر يوزّع روابط تؤدي إلى صفحة غير موجودة.
  const card = await fetchPublicCard(parsed.data);
  if (!card) {
    return new Response('Not found', { status: 404 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'png' ? 'png' : 'svg';
  const size = clamp(Number(url.searchParams.get('size') ?? 512), 128, 2048);

  const target = publicCardUrl(parsed.data);

  // مستوى تصحيح الأخطاء M: يتحمّل تلف ربع الرمز تقريباً، وهو الحد
  // العملي لرمز يُطبع على ورق ويُصوَّر بكاميرا هاتف في إضاءة متغيرة.
  const options = { errorCorrectionLevel: 'M' as const, margin: 2, width: size };

  if (format === 'png') {
    const buffer = await QRCode.toBuffer(target, { ...options, type: 'png' });
    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': 'image/png',
        'content-disposition': `attachment; filename="${parsed.data}-qr.png"`,
        'cache-control': 'public, max-age=86400, s-maxage=604800, immutable',
      },
    });
  }

  const svg = await QRCode.toString(target, { ...options, type: 'svg' });
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=604800, immutable',
    },
  });
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}
