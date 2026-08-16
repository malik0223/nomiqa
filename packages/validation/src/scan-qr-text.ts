import type { ExtractedContact } from '@nomiqa/contracts';
import { extractPhone, parseBusinessCard } from './scan-card-text.js';

/**
 * قراءة رمز QR من منصة أخرى (§11.2).
 *
 * مندوب في معرض يقابل من يحمل بطاقة رقمية من منافس. الرمز الذي يعرضه
 * يحمل — في أغلب المنصات — بطاقة vCard كاملة أو MECARD، وهي بيانات
 * **أعطاها صاحبها للمسح** بمحض إرادته. رفض قراءتها لأنها ليست بصيغتنا
 * يعني إعادة كتابتها يدوياً من شاشة هاتف الطرف الآخر.
 *
 * وما لا يحمل حقولاً — رابط مجرد — يُقبل كرابط ولا يُخترع له اسم.
 */

/** ثقة الحقل القادم من صيغة مُهيكلة: قرأناه من وسم صريح لا من تخمين. */
const STRUCTURED_CONFIDENCE = 0.98;

export interface QrParseResult {
  /** vcard | mecard | url | text */
  format: string;
  extracted: ExtractedContact;
}

export function parseScannedQr(payload: string): QrParseResult {
  const trimmed = payload.trim();

  if (/^BEGIN:VCARD/i.test(trimmed)) {
    return { format: 'vcard', extracted: parseVCard(trimmed) };
  }

  if (/^MECARD:/i.test(trimmed)) {
    return { format: 'mecard', extracted: parseMeCard(trimmed) };
  }

  if (/^https?:\/\//i.test(trimmed) && !/\s/.test(trimmed)) {
    // رابط وحده: لا اسم ولا هاتف. نحفظه في `website` ولا نخترع الباقي
    // — بطاقة رقمية خلف الرابط قد تكون خاصة، وجلبها من الخادم يعني
    // أننا نزور موقعاً بالنيابة عن المستخدم بلا أن يطلب.
    return {
      format: 'url',
      extracted: { website: { value: trimmed, confidence: STRUCTURED_CONFIDENCE } },
    };
  }

  // نص حر: نمرّره على قارئ البطاقات نفسه. بعض المنصات تضع في الرمز
  // نصاً بسطور تماماً كوجه البطاقة.
  return { format: 'text', extracted: parseBusinessCard(trimmed) };
}

/**
 * vCard 2.1/3.0/4.0.
 *
 * نقرأ ما يخصّ جهة الاتصال فقط: الاسم والبريد والهاتف والمنشأة
 * والمسمّى والموقع. البقية — الصورة والعنوان والميلاد وملاحظات
 * صاحبها — لا نطلبها ولا نخزّنها: التقاط عميل محتمل ليس نسخاً لدفتر
 * عناوين شخص.
 */
function parseVCard(payload: string): ExtractedContact {
  const extracted: ExtractedContact = {};
  // الأسطر المطوية (سطر يبدأ بمسافة) تُدمج بما قبلها — قاعدة الصيغة.
  const lines = payload.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);

  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;

    // الاسم قد يحمل معاملات: `TEL;TYPE=CELL:...`.
    const name = line.slice(0, separator).split(';')[0]?.toUpperCase() ?? '';
    const value = unescapeVCard(line.slice(separator + 1).trim());

    if (value.length === 0) continue;

    switch (name) {
      case 'FN':
        extracted.fullName ??= { value, confidence: STRUCTURED_CONFIDENCE };
        break;
      case 'N':
        // `N` مركّب: العائلة؛الاسم؛الأوسط؛اللقب؛اللاحقة. يُستخدم بديلاً
        // حين تغيب `FN` — وهي غائبة في مولّدات كثيرة.
        if (!extracted.fullName) {
          const composed = value.split(';').slice(0, 2).reverse().filter(Boolean).join(' ').trim();
          if (composed) extracted.fullName = { value: composed, confidence: STRUCTURED_CONFIDENCE };
        }
        break;
      case 'EMAIL':
        extracted.email ??= { value: value.toLowerCase(), confidence: STRUCTURED_CONFIDENCE };
        break;
      case 'TEL':
        extracted.phone ??= extractPhone(value) ?? undefined;
        break;
      case 'ORG':
        extracted.organizationName ??= {
          value: value.split(';')[0]?.trim() ?? value,
          confidence: STRUCTURED_CONFIDENCE,
        };
        break;
      case 'TITLE':
        extracted.jobTitle ??= { value, confidence: STRUCTURED_CONFIDENCE };
        break;
      case 'URL':
        extracted.website ??= { value, confidence: STRUCTURED_CONFIDENCE };
        break;
      default:
        break;
    }
  }

  return extracted;
}

/**
 * MECARD — صيغة مختصرة شائعة في تطبيقات المسح اليابانية والكورية،
 * وما زالت تخرج من مولّدات رموز كثيرة.
 */
function parseMeCard(payload: string): ExtractedContact {
  const extracted: ExtractedContact = {};
  const body = payload.replace(/^MECARD:/i, '').replace(/;;$/, '');

  for (const field of body.split(';')) {
    const separator = field.indexOf(':');
    if (separator === -1) continue;

    const key = field.slice(0, separator).toUpperCase();
    const value = field.slice(separator + 1).trim();
    if (value.length === 0) continue;

    switch (key) {
      case 'N':
        // `العائلة,الاسم` — تُقلب لتُقرأ كما يُنطق الاسم.
        extracted.fullName ??= {
          value: value.split(',').reverse().join(' ').trim(),
          confidence: STRUCTURED_CONFIDENCE,
        };
        break;
      case 'EMAIL':
        extracted.email ??= { value: value.toLowerCase(), confidence: STRUCTURED_CONFIDENCE };
        break;
      case 'TEL':
        extracted.phone ??= extractPhone(value) ?? undefined;
        break;
      case 'ORG':
        extracted.organizationName ??= { value, confidence: STRUCTURED_CONFIDENCE };
        break;
      case 'URL':
        extracted.website ??= { value, confidence: STRUCTURED_CONFIDENCE };
        break;
      default:
        break;
    }
  }

  return extracted;
}

/** فك هروب vCard: الفاصلة والفاصلة المنقوطة وسطر جديد. */
function unescapeVCard(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}
