import { createHash } from 'node:crypto';
import { signDetached, type Pkcs7SignerMaterial } from './pkcs7.js';
import { buildZip, type ZipEntry } from './zip.js';

/**
 * حزمة Apple Wallet (§10.2).
 *
 * القرار الحاكم: **البطاقة في المحفظة نافذة على الرابط الثابت لا نسخة
 * من البطاقة**. تحمل الاسم والمسمى ورمز QR يشفّر `nomiqa.om/<slug>`،
 * ولا تحمل أرقام الهواتف ولا الروابط ولا الصور الكاملة.
 *
 * السبب ليس التبسيط: البطاقة في المحفظة تُحدَّث بخدمة ويب مستقلة لا
 * بفتح رابط، فمحتواها المخزَّن يتجمّد عند لحظة الإصدار. نسخة كاملة
 * فيها تعني بيانات قديمة في جيب المتلقي بلا أن يعرف — وهي المشكلة
 * نفسها التي وُجدت المنصة لحلها في البطاقة الورقية.
 */

export interface ApplePassContent {
  serialNumber: string;
  authenticationToken: string;
  /** الاسم الظاهر أعلى البطاقة. */
  fullName: string;
  jobTitle: string | null;
  organizationName: string;
  /** الرابط الثابت — يُشفَّر في رمز QR على البطاقة. */
  cardUrl: string;
  /** ‎#RRGGBB. يتحول إلى صيغة rgb() التي تقبلها المواصفة. */
  accentColor: string;
  /** ملفات الصور المطلوبة: icon.png وicon@2x.png على الأقل. */
  images: ZipEntry[];
  locale: 'ar' | 'en';
}

export interface ApplePassIdentity {
  passTypeIdentifier: string;
  teamIdentifier: string;
  /** رابط خدمة تحديث البطاقة. اختياري — بدونه لا تُحدَّث تلقائياً. */
  webServiceUrl?: string;
}

/**
 * يبني `pass.json`.
 *
 * `generic` لا `storeCard` ولا `eventTicket`: الأنواع الأخرى تفرض حقولاً
 * (تاريخ، رصيد، مكان) لا معنى لها في بطاقة تعريف، وتظهر فارغة في
 * واجهة المحفظة.
 */
export function buildPassJson(identity: ApplePassIdentity, content: ApplePassContent): string {
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: identity.passTypeIdentifier,
    teamIdentifier: identity.teamIdentifier,
    serialNumber: content.serialNumber,
    authenticationToken: content.authenticationToken,
    ...(identity.webServiceUrl ? { webServiceURL: identity.webServiceUrl } : {}),
    organizationName: content.organizationName,
    description: `${content.fullName} — ${content.organizationName}`,
    // اللغة الافتراضية للعرض حين لا يطابق نظام الجهاز أي ترجمة مرفقة.
    logoText: content.organizationName,
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(255, 255, 255)',
    backgroundColor: toRgbString(content.accentColor),
    // الرمز `QR` بترميز ISO-8859-1: هو ما توثّقه Apple، وUTF-8 يُرفض
    // على أجهزة قديمة. الرابط ASCII بالكامل فلا خسارة.
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: content.cardUrl,
        messageEncoding: 'iso-8859-1',
        altText: displayUrl(content.cardUrl),
      },
    ],
    generic: {
      primaryFields: [
        {
          key: 'name',
          label: content.locale === 'ar' ? 'الاسم' : 'Name',
          value: content.fullName,
        },
      ],
      secondaryFields: content.jobTitle
        ? [
            {
              key: 'title',
              label: content.locale === 'ar' ? 'المسمى' : 'Title',
              value: content.jobTitle,
            },
          ]
        : [],
      backFields: [
        {
          key: 'card',
          label: content.locale === 'ar' ? 'البطاقة الرقمية' : 'Digital card',
          value: content.cardUrl,
          attributedValue: `<a href="${content.cardUrl}">${displayUrl(content.cardUrl)}</a>`,
        },
      ],
    },
  };

  // مسافتان لا صفر: الملف يُقرأ يدوياً عند تشخيص رفض من الجهاز، وهو
  // أول ما يُفتح حين لا تُضاف البطاقة بلا رسالة خطأ مفيدة.
  return JSON.stringify(pass, null, 2);
}

/**
 * يبني `manifest.json`: بصمة SHA-1 لكل ملف في الحزمة.
 *
 * SHA-1 هنا **ليست خياراً**: المواصفة تحددها، والجهاز يحسبها ليقارن.
 * ضعفها أمام التصادم لا يمسّ الأمان هنا لأن البيان نفسه محمي بتوقيع
 * SHA-256 — التبديل يتطلب كسر الاثنين معاً.
 */
export function buildManifest(files: ZipEntry[]): string {
  const manifest: Record<string, string> = {};

  for (const file of files) {
    manifest[file.name] = createHash('sha1').update(file.data).digest('hex');
  }

  return JSON.stringify(manifest, null, 2);
}

/**
 * يبني الحزمة الموقَّعة كاملة.
 *
 * الترتيب إلزامي منطقياً: البيان يبصم كل الملفات، والتوقيع يوقّع
 * البيان، فلا يجوز أن يدخل التوقيع في البيان — ولا أن يُبنى البيان بعد
 * إضافة ملف.
 */
export function buildPkpass(
  identity: ApplePassIdentity,
  content: ApplePassContent,
  material: Pkcs7SignerMaterial,
): Buffer {
  const passJson: ZipEntry = {
    name: 'pass.json',
    data: Buffer.from(buildPassJson(identity, content), 'utf8'),
  };

  const files = [passJson, ...content.images];
  const manifest: ZipEntry = {
    name: 'manifest.json',
    data: Buffer.from(buildManifest(files), 'utf8'),
  };

  const signature: ZipEntry = {
    name: 'signature',
    data: signDetached(manifest.data, material),
  };

  return buildZip([...files, manifest, signature]);
}

/** ‎#0f766e → rgb(15, 118, 110). المواصفة لا تقبل HEX. */
export function toRgbString(hex: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());

  if (!match) {
    return 'rgb(15, 118, 110)';
  }

  const value = parseInt(match[1]!, 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host.replace(/^www\./, '')}${parsed.pathname}`;
  } catch {
    return url;
  }
}
