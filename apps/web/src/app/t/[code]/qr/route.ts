import QRCode from 'qrcode';
import { shareCodeSchema } from '@nomiqa/validation';
import { appBaseUrl } from '../../../../lib/cards';
import { resolveShareCode } from '../../../../lib/presence';

/**
 * رمز الحملة أو الوسم.
 *
 * يشفّر `nomiqa.om/t/<code>` لا رابط البطاقة: هذا **كامل الغرض** من
 * طبقة الإحالة. رمز حملة يشفّر رابط البطاقة مباشرةً لا يُقاس ولا
 * يُعاد توجيهه، ورمز يشفّر رابطاً بخمسة معاملات UTM يصير كثيفاً إلى حد
 * يصعب مسحه من لافتة.
 *
 * والكود يُحلّ قبل الإصدار لا بعده: رمز لكود غير معروف ورقةٌ مطبوعة لا
 * تؤدي إلى شيء، واكتشاف ذلك بعد الطباعة كلفةٌ لا تُسترد.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await context.params;

  const parsed = shareCodeSchema.safeParse(code);
  if (!parsed.success) {
    return new Response('Not found', { status: 404 });
  }

  const target = await resolveShareCode(parsed.data);
  if (!target) {
    return new Response('Not found', { status: 404 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'png' ? 'png' : 'svg';
  const size = clamp(Number(url.searchParams.get('size') ?? 512), 128, 2048);

  const dark = hexParam(url.searchParams.get('dark')) ?? '#000000';
  const light = hexParam(url.searchParams.get('light')) ?? '#ffffff';

  const options = {
    errorCorrectionLevel: 'M' as const,
    margin: 2,
    width: size,
    color: { dark, light },
  };

  const shareUrl = `${appBaseUrl()}/t/${parsed.data}`;

  if (format === 'png') {
    const buffer = await QRCode.toBuffer(shareUrl, { ...options, type: 'png' });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': 'image/png',
        'content-disposition': `attachment; filename="${parsed.data}-qr.png"`,
        // أقصر من تخزين رمز البطاقة: وجهة الكود قابلة للتغيير، والرمز
        // نفسه ثابت — لكن إصداره يتحقق من وجود الكود، ونسخة مخزَّنة
        // أسبوعاً تُبقي رمزاً لكود أُبطل قابلاً للتنزيل.
        'cache-control': 'public, max-age=3600',
      },
    });
  }

  const svg = await QRCode.toString(shareUrl, { ...options, type: 'svg' });

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}

function hexParam(value: string | null): string | null {
  if (!value) return null;

  const normalized = value.startsWith('#') ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}
