import { MEETING_BACKGROUND_SIZE, type MeetingPlatform } from '@nomiqa/contracts';
import { cssColor, escapeHtml } from './signature-render.js';

/**
 * خلفيات الاجتماعات (خارطة الطريق §10.3).
 *
 * SVG لا PNG: النص يبقى نصاً فيظهر حاداً على أي دقة، والملف كيلوبايتات
 * لا ميغابايتات، وتوليده لا يحتاج مكتبة تنقيط في الخادم. التحويل إلى
 * PNG — وهو ما تطلبه منصات الاجتماعات — يقع في المتصفح عند التنزيل.
 *
 * القاعدة الحاكمة للتخطيط: **المنطقة الآمنة تختلف بين المنصات الثلاث
 * والأبعاد لا تختلف**. الثلاث تقبل 1920×1080، لكن:
 *
 *  - Zoom يعكس المعاينة الذاتية أفقياً. المتحدث يرى نصه مقلوباً فيظن
 *    الخلفية معطوبة، فنضع المحتوى في الجهة التي يشغلها وجهه أقل —
 *    ويبقى صحيحاً لمن يشاهده.
 *  - Teams يقصّ الحواف عند نسب عرض مختلفة، فنبعد المحتوى عنها.
 *  - Meet يضع شريط أدوات أسفل الإطار يغطي نحو 120 بكسل.
 */

const { width: WIDTH, height: HEIGHT } = MEETING_BACKGROUND_SIZE;

export interface MeetingBackgroundSource {
  fullName: string;
  jobTitle: string | null;
  organizationName: string | null;
  cardUrl: string;
  /** رمز QR كـSVG مضمَّن. null حين يُطفئه المستخدم. */
  qrSvg: string | null;
  logoUrl: string | null;
  accentColor: string;
  direction: 'rtl' | 'ltr';
  scheme: 'light' | 'dark';
}

/**
 * المنطقة الآمنة لكل منصة.
 *
 * `bottom` هو ما يُترك فارغاً أسفل الإطار، و`side` ما يُترك على الحافة
 * التي يُبنى منها المحتوى.
 */
const SAFE_AREA: Record<MeetingPlatform, { side: number; bottom: number }> = {
  zoom: { side: 96, bottom: 96 },
  teams: { side: 140, bottom: 120 },
  meet: { side: 96, bottom: 150 },
};

const PALETTE = {
  dark: { background: '#0b1220', panel: '#111c30', text: '#f8fafc', muted: '#94a3b8' },
  light: { background: '#f1f5f9', panel: '#ffffff', text: '#0f172a', muted: '#475569' },
} as const;

/**
 * يبني خلفية اجتماع.
 *
 * المحتوى في **الربع السفلي من جهة واحدة** لا في الوسط: وسط الإطار
 * يشغله وجه المتحدث، وأي نص هناك يختفي خلفه — وهو الخطأ الأول في كل
 * خلفية صنعها أحد بنفسه.
 */
export function renderMeetingBackground(
  platform: MeetingPlatform,
  source: MeetingBackgroundSource,
): string {
  const safe = SAFE_AREA[platform];
  const palette = PALETTE[source.scheme];
  const accent = cssColor(source.accentColor);

  const panelWidth = source.qrSvg ? 760 : 620;
  const panelHeight = 232;
  const panelX = source.direction === 'rtl' ? WIDTH - safe.side - panelWidth : safe.side;
  const panelY = HEIGHT - safe.bottom - panelHeight;

  const textAnchor = source.direction === 'rtl' ? 'end' : 'start';
  const textX =
    source.direction === 'rtl' ? panelX + panelWidth - 40 : panelX + 40 + (source.qrSvg ? 172 : 0);

  const qrX = source.direction === 'rtl' ? panelX + 40 : panelX + 40;
  const qrY = panelY + 40;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img">`,
    `<title>${escapeHtml(source.fullName)}</title>`,
    '<defs>',
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${palette.background}"/>`,
    `<stop offset="1" stop-color="${accent}" stop-opacity="0.35"/>`,
    '</linearGradient>',
    '</defs>',
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>`,
    // شريط بلون المؤسسة على الحافة السفلية: يظهر حتى حين يغطي المتحدث
    // اللوحة كلها بحركته.
    `<rect x="0" y="${HEIGHT - 12}" width="${WIDTH}" height="12" fill="${accent}"/>`,
    `<rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="28" fill="${palette.panel}" fill-opacity="0.92"/>`,
  ];

  if (source.qrSvg) {
    lines.push(
      `<rect x="${qrX}" y="${qrY}" width="152" height="152" rx="12" fill="#ffffff"/>`,
      `<g transform="translate(${qrX + 8}, ${qrY + 8})">${embedQr(source.qrSvg, 136)}</g>`,
    );
  }

  lines.push(
    textLine(source.fullName, textX, panelY + 92, 46, 700, palette.text, textAnchor),
  );

  if (source.jobTitle) {
    lines.push(textLine(source.jobTitle, textX, panelY + 140, 28, 500, palette.muted, textAnchor));
  }

  if (source.organizationName) {
    lines.push(
      textLine(source.organizationName, textX, panelY + 178, 26, 500, accent, textAnchor),
    );
  }

  // الرابط دائماً بـLTR ومحاذاته تتبع الجهة: عنوان لاتيني داخل نص عربي
  // يُعرض معكوساً بلا هذا التثبيت.
  lines.push(
    `<text x="${textX}" y="${panelY + 214}" direction="ltr" text-anchor="${textAnchor}"`,
    ` font-family="monospace" font-size="22" fill="${palette.muted}">${escapeHtml(displayUrl(source.cardUrl))}</text>`,
  );

  lines.push('</svg>');

  return lines.join('');
}

/** سطر نص بخط النظام. لا خط مستضاف: الملف يُفتح بلا اتصال. */
function textLine(
  value: string,
  x: number,
  y: number,
  size: number,
  weight: number,
  fill: string,
  anchor: string,
): string {
  return [
    `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}"`,
    ` font-family="Segoe UI, Noto Sans Arabic, Tahoma, sans-serif"`,
    ` font-size="${size}" font-weight="${weight}">${escapeHtml(value)}</text>`,
  ].join('');
}

/**
 * يدمج رمز QR داخل الخلفية.
 *
 * الرمز يصل كـSVG كامل بوسم جذر خاص به؛ تعشيش `<svg>` داخل `<svg>`
 * صالح في المواصفة لكن محرّكات التنقيط في المتصفحات تتفاوت في احترام
 * `viewBox` المتداخل. فنستخرج المحتوى وحده ونضع تحجيمه بأنفسنا.
 */
function embedQr(qrSvg: string, size: number): string {
  const viewBox = /viewBox="([^"]+)"/.exec(qrSvg)?.[1] ?? '0 0 33 33';
  const inner = qrSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const extent = Number(viewBox.split(/\s+/)[2] ?? 33);
  const scale = size / (Number.isFinite(extent) && extent > 0 ? extent : 33);

  return `<g transform="scale(${scale.toFixed(4)})">${inner}</g>`;
}

function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host.replace(/^www\./, '')}${parsed.pathname}`;
  } catch {
    return url;
  }
}
