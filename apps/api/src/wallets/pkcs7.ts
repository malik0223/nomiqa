import { createHash, createSign, X509Certificate } from 'node:crypto';
import {
  algorithmIdentifier,
  encode,
  explicit,
  implicitConstructed,
  integer,
  issuerAndSerial,
  octetString,
  oid,
  sequence,
  setOf,
  TAG,
  utcTime,
} from './der.js';

/**
 * توقيع PKCS#7 مفصول لحزمة Apple Wallet.
 *
 * الحزمة `.pkpass` أرشيف يحوي `manifest.json` وملف `signature` بجانبه.
 * الملف الثاني توقيع **مفصول** (detached) على الأول: لا يحمل نسخة من
 * المحتوى بل بصمته، فيتحقق النظام من كل ملف في الأرشيف عبر بصمته في
 * البيان، ومن البيان عبر هذا التوقيع.
 *
 * سلسلة الثقة ثلاثية: شهادة الموقّع (Pass Type ID) ← شهادة Apple
 * الوسيطة (WWDR) ← جذر Apple المثبَّت في النظام. الوسيطة تُدرَج في
 * التوقيع لأن الجهاز لا يملكها بالضرورة، والجذر لا يُدرج لأنه موجود.
 */

const OID = {
  DATA: '1.2.840.113549.1.7.1',
  SIGNED_DATA: '1.2.840.113549.1.7.2',
  CONTENT_TYPE: '1.2.840.113549.1.9.3',
  MESSAGE_DIGEST: '1.2.840.113549.1.9.4',
  SIGNING_TIME: '1.2.840.113549.1.9.5',
  SHA256: '2.16.840.1.101.3.4.2.1',
  RSA_ENCRYPTION: '1.2.840.113549.1.1.1',
} as const;

export interface Pkcs7SignerMaterial {
  /** شهادة Pass Type ID بصيغة PEM. */
  certificatePem: string;
  /** المفتاح الخاص المقابل بصيغة PEM. */
  privateKeyPem: string;
  /** شهادة Apple WWDR الوسيطة بصيغة PEM. */
  wwdrPem: string;
  /** عبارة مرور المفتاح إن كان مشفَّراً. */
  passphrase?: string;
}

/**
 * يبني توقيعاً مفصولاً على المحتوى المعطى.
 *
 * السمات الموقَّعة الثلاث (`contentType` و`signingTime` و
 * `messageDigest`) ليست اختيارية عملياً: وجود أيٍّ منها يحوّل التوقيع
 * من توقيع على المحتوى مباشرةً إلى توقيع على **مجموعة السمات**،
 * وغيابها معاً يرفضه التحقق في iOS.
 */
export function signDetached(content: Buffer, material: Pkcs7SignerMaterial): Buffer {
  const signerCertificate = new X509Certificate(material.certificatePem);
  const wwdrCertificate = new X509Certificate(material.wwdrPem);

  const digest = createHash('sha256').update(content).digest();

  const signedAttributes = setOf(
    attribute(OID.CONTENT_TYPE, oid(OID.DATA)),
    attribute(OID.SIGNING_TIME, utcTime(new Date())),
    attribute(OID.MESSAGE_DIGEST, octetString(digest)),
  );

  const signature = createSign('sha256')
    .update(signedAttributes)
    .sign({ key: material.privateKeyPem, passphrase: material.passphrase });

  const { issuer, serialNumber } = issuerAndSerial(signerCertificate.raw);

  const signerInfo = sequence(
    integer(1),
    sequence(issuer, serialNumber),
    algorithmIdentifier(OID.SHA256),
    // الوسم الضمني [0] يستبدل وسم `SET` هنا، بينما التوقيع يُحسب على
    // الترميز بوسم `SET` الأصلي. المواصفة تنص على ذلك صراحةً، وخلطهما
    // من أكثر أخطاء CMS اليدوية شيوعاً.
    implicitConstructed(0, signedAttributes.subarray(headerLength(signedAttributes))),
    algorithmIdentifier(OID.RSA_ENCRYPTION),
    octetString(signature),
  );

  const signedData = sequence(
    integer(1),
    setOf(algorithmIdentifier(OID.SHA256)),
    // بلا محتوى: هذا معنى «مفصول».
    sequence(oid(OID.DATA)),
    implicitConstructed(
      0,
      Buffer.concat([signerCertificate.raw, wwdrCertificate.raw]),
    ),
    setOf(signerInfo),
  );

  return sequence(oid(OID.SIGNED_DATA), explicit(0, signedData));
}

/** سمة موقَّعة: معرّف وقيمة داخل مجموعة. */
function attribute(attributeOid: string, value: Buffer): Buffer {
  return sequence(oid(attributeOid), encode(TAG.SET, value));
}

/** طول ترويسة TLV — لعزل المحتوى عن وسمه عند إعادة الوسم الضمني. */
function headerLength(tlv: Buffer): number {
  const first = tlv[1] ?? 0;
  return (first & 0x80) === 0 ? 2 : 2 + (first & 0x7f);
}
