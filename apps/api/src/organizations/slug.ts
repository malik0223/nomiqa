import { RESERVED_SLUGS } from '@nomiqa/validation';

const MIN_LENGTH = 3;
const MAX_LENGTH = 32;
const FALLBACK = 'workspace';

/**
 * يشتق أساس slug من البريد الإلكتروني.
 *
 * دالة نقية: لا تضمن التفرّد — ذلك مسؤولية المستدعي الذي يفحص
 * قاعدة البيانات. تضمن فقط أن الناتج **صالح الشكل وغير محجوز**.
 *
 * لا نستخدم الاسم الكامل لأنه قد يكون عربياً بالكامل، والـslug
 * مقصور على الحروف اللاتينية لتفادي مشكلات النسخ والمشاركة عبر QR.
 */
export function deriveSlugBase(email: string): string {
  const localPart = email.split('@')[0] ?? '';

  const normalized = localPart
    .toLowerCase()
    // نقاط وشرطات سفلية شائعة في البريد — تصبح شرطات
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    // القص قد يترك شرطة في النهاية
    .replace(/-+$/g, '');

  if (normalized.length < MIN_LENGTH) {
    return FALLBACK;
  }

  // الكلمات المحجوزة تتعارض مع مسارات النظام مثل /admin و/api
  if ((RESERVED_SLUGS as readonly string[]).includes(normalized)) {
    return `${normalized}-${FALLBACK}`.slice(0, MAX_LENGTH);
  }

  return normalized;
}

/** لاحقة عشوائية قصيرة تُستخدم عند تعارض الـslug. */
export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}
