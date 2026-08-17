import QRCode from 'qrcode';
import { SHARE_SOURCES } from '@nomiqa/contracts';
import { slugSchema } from '@nomiqa/validation';
import { fetchPublicCard, publicCardUrl } from '@/lib/cards';

/**
 * رمز QR للبطاقة.
 *
 * القاعدة الحاكمة (§7.4، وبوابة خروج المرحلة 2): **الرمز يشفّر الرابط
 * الثابت لا محتوى البطاقة**. لو شفّرنا البيانات لصار كل تعديل يستوجب
 * إعادة طباعة كل ما طُبع — وهي بالضبط المشكلة التي وُجدت المنصة لحلها.
 *
 * المرحلة 5 أضافت التخصيص (§10.2): لون الرمز وخلفيته وشعار في وسطه.
 * ثلاثتها **تغيّر شكل الرمز لا وجهته**، فتبقى القاعدة أعلاه سليمة —
 * ورمز أُصدر بلون قديم يظل يعمل بعد تغيير ألوان المؤسسة.
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
  const withLogo = url.searchParams.get('logo') === '1';

  const dark = hexParam(url.searchParams.get('dark')) ?? '#000000';
  // الخلفية بيضاء لا شفافة افتراضياً: رمز شفاف يُطبع على ورق ملوّن أو
  // يُلصق على خلفية داكنة فيصير غير قابل للمسح، والعطل يظهر بعد الطباعة.
  const light = hexParam(url.searchParams.get('light')) ?? '#ffffff';

  // `src` يميّز المسح من رمز مطبوع عن فتح رابط مُشارَك — لا سبيل آخر
  // لقياسه، فالمسح يفتح متصفحاً عادياً بلا أثر يميّزه. القيمة تُفحص
  // مقابل القائمة المشتركة فلا يُحقن مصدر مخترع في التقارير.
  const requested = url.searchParams.get('src') ?? 'qr';
  const source = (SHARE_SOURCES as readonly string[]).includes(requested) ? requested : 'qr';

  // المقطع نفسه لا يتغير: القاعدة §7.4 تخص **مسار** البطاقة، وهو ثابت.
  // ولو حُذف هذا المعامل لاحقاً لبقيت كل الرموز المطبوعة تعمل، فالصفحة
  // تتجاهل ما لا تعرفه.
  const target = `${publicCardUrl(parsed.data)}?src=${source}`;

  // مستوى M يتحمّل تلف ربع الرمز تقريباً، وهو الحد العملي لرمز يُطبع
  // ويُصوَّر بكاميرا هاتف في إضاءة متغيرة. مع الشعار نرفعه إلى H: الشعار
  // يحجب وسط الرمز فعلاً، وتغطيته بلا تصحيح أعلى تنتج رمزاً لا يُقرأ.
  const options = {
    errorCorrectionLevel: withLogo ? ('H' as const) : ('M' as const),
    margin: 2,
    width: size,
    color: { dark, light },
  };

  if (format === 'png') {
    // الشعار لا يُركَّب على PNG: التركيب يحتاج مكتبة معالجة صور في
    // الخادم، والنسخة المتجهة تكفي للطباعة — وهي الاستخدام الذي يطلب
    // الشعار أصلاً. تُوثَّق هذه الحدود في docs/presence/nfc-and-wallets.md.
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
  const logoUrl = card.snapshot.media.logoUrl ?? card.snapshot.media.avatarUrl ?? null;

  return new Response(withLogo && logoUrl ? overlayLogo(svg, logoUrl, light) : svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=604800, immutable',
    },
  });
}

/**
 * يركّب شعار المؤسسة في وسط الرمز.
 *
 * المساحة المغطاة نحو 22% من ضلع الرمز — أي 5% من مساحته. مستوى
 * التصحيح H يتحمّل 30%، والهامش الواسع بينهما مقصود: الرمز يُطبع
 * ويُمسح في ظروف إضاءة رديئة، وحساب الحد الأقصى نظرياً يعطي رمزاً
 * يعمل في المختبر ويفشل على لافتة.
 */
function overlayLogo(svg: string, logoUrl: string, background: string): string {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  const extent = Number(viewBox?.split(/\s+/)[2] ?? 0);

  if (!Number.isFinite(extent) || extent <= 0) {
    return svg;
  }

  const side = extent * 0.22;
  const offset = (extent - side) / 2;
  const padding = side * 0.12;

  const overlay = [
    `<rect x="${offset - padding}" y="${offset - padding}"`,
    ` width="${side + padding * 2}" height="${side + padding * 2}"`,
    ` rx="${side * 0.18}" fill="${background}" />`,
    `<image href="${escapeAttribute(logoUrl)}" x="${offset}" y="${offset}"`,
    ` width="${side}" height="${side}" preserveAspectRatio="xMidYMid meet" />`,
  ].join('');

  return svg.replace('</svg>', `${overlay}</svg>`);
}

/** لون HEX من ستة أرقام. ما عداه يُتجاهل بدل إدراجه في الناتج. */
function hexParam(value: string | null): string | null {
  if (!value) return null;

  const normalized = value.startsWith('#') ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}
