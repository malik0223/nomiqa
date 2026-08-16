import { importPKCS8, SignJWT } from 'jose';

/**
 * بطاقة Google Wallet (§10.2).
 *
 * آلية مختلفة جذرياً عن Apple: لا ملف يُنزَّل ولا توقيع ثنائي. نبني
 * وصف البطاقة، ونوقّعه JWT بمفتاح حساب خدمة، ونعطي المستخدم رابط
 * `pay.google.com/gp/v/save/<jwt>`. يفتحه فتُنشئ Google البطاقة وتضيفها.
 *
 * الأثر العملي المهم: **البطاقة تُنشأ من الرابط لا من استدعاء API**.
 * لا نحتاج رمز وصول ولا رحلة إلى خوادم Google عند الإصدار، ولا يفشل
 * الإصدار لانقطاع شبكة عندنا.
 */

/** المضيف الذي يستقبل الرابط الموقّع. */
const SAVE_URL_BASE = 'https://pay.google.com/gp/v/save';

/** صلاحية الرابط. */
const JWT_TTL_SECONDS = 3600;

export interface GoogleWalletConfig {
  /** معرّف المُصدِر من Google Pay & Wallet Console. */
  issuerId: string;
  serviceAccountEmail: string;
  /** مفتاح حساب الخدمة الخاص بصيغة PKCS#8 PEM. */
  privateKeyPem: string;
  /** أصل التطبيق — يُسجَّل كأصل مسموح في الرابط. */
  origin: string;
}

export interface GoogleWalletPassContent {
  /** معرّف الكائن داخل المُصدِر. يجب أن يكون فريداً وثابتاً للبطاقة. */
  objectSuffix: string;
  classSuffix: string;
  fullName: string;
  jobTitle: string | null;
  organizationName: string;
  cardUrl: string;
  accentColor: string;
  logoUrl: string | null;
  locale: 'ar' | 'en';
}

/**
 * يبني الرابط الموقّع.
 *
 * الكائن يُرسل **مضمَّناً في الحمولة** لا مُشاراً إليه بمعرّف: الإرسال
 * المضمَّن ينشئ الكائن إن لم يوجد ويحدّثه إن وجد، فلا نحتاج استدعاء
 * إنشاء منفصلاً ولا نتعامل مع حالة «الكائن موجود مسبقاً».
 */
export async function buildGoogleSaveUrl(
  config: GoogleWalletConfig,
  content: GoogleWalletPassContent,
): Promise<string> {
  const key = await importPKCS8(config.privateKeyPem, 'RS256');

  const genericObject = {
    id: `${config.issuerId}.${content.objectSuffix}`,
    classId: `${config.issuerId}.${content.classSuffix}`,
    state: 'ACTIVE',
    hexBackgroundColor: normalizeHex(content.accentColor),
    cardTitle: localized(content.organizationName, content.locale),
    header: localized(content.fullName, content.locale),
    ...(content.jobTitle
      ? { subheader: localized(content.jobTitle, content.locale) }
      : {}),
    ...(content.logoUrl
      ? {
          logo: {
            sourceUri: { uri: content.logoUrl },
            contentDescription: localized(content.organizationName, content.locale),
          },
        }
      : {}),
    // الرمز يشفّر الرابط الثابت — القاعدة نفسها التي تحكم كل رمز في
    // المنصة منذ المرحلة 2 (§7.4).
    barcode: {
      type: 'QR_CODE',
      value: content.cardUrl,
      alternateText: displayUrl(content.cardUrl),
    },
    linksModuleData: {
      uris: [
        {
          uri: content.cardUrl,
          description: content.locale === 'ar' ? 'البطاقة الرقمية' : 'Digital card',
          id: 'card',
        },
      ],
    },
  };

  return `${SAVE_URL_BASE}/${await new SignJWT({
    iss: config.serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    // الأصل المسموح: يمنع إعادة استخدام الرابط الموقّع من صفحة أخرى.
    origins: [config.origin],
    payload: { genericObjects: [genericObject] },
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${JWT_TTL_SECONDS}s`)
    .sign(key)}`;
}

/**
 * وصف الصنف الذي تنتمي إليه البطاقات.
 *
 * يُنشأ مرة واحدة لكل مؤسسة من لوحة Google أو عبر واجهتها، ويُرجَع هنا
 * ليوثَّق شكله المتوقَّع: صنف مفقود يجعل كل رابط يفشل بعد فتحه — أي
 * فشلاً يظهر عند المستخدم داخل Google لا عندنا.
 */
export function describeGenericClass(issuerId: string, classSuffix: string) {
  return {
    id: `${issuerId}.${classSuffix}`,
    classTemplateInfo: {
      cardBarcodeSectionDetails: {
        firstTopDetail: {
          fieldSelector: { fields: [{ fieldPath: "object.textModulesData['title']" }] },
        },
      },
    },
  };
}

function localized(value: string, locale: 'ar' | 'en') {
  return {
    defaultValue: { language: locale, value },
  };
}

/** Google تقبل ‎#RRGGBB وترفض ما عداه. */
function normalizeHex(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : '#0f766e';
}

function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host.replace(/^www\./, '')}${parsed.pathname}`;
  } catch {
    return url;
  }
}
