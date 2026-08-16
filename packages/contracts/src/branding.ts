/**
 * أنواع الهوية المؤسسية وسير الموافقة (خارطة الطريق §9.3).
 */

/**
 * الحقول التي يمكن قفلها.
 *
 * قائمة مغلقة لا نص حر: مفتاح مكتوب خطأً كان سيقفل لا شيء ويبدو
 * للمسؤول أنه قفل شيئاً — أسوأ من رفض القيمة.
 */
export const LOCKABLE_FIELDS = [
  'organizationName',
  'jobTitle',
  'department',
  'fullName',
  'bio',
  'addressLine',
  'theme',
  'templateKey',
  'logo',
  'cover',
  'avatar',
  'links',
  'contactForm',
] as const;

export type LockableField = (typeof LOCKABLE_FIELDS)[number];

export interface BrandKitPayload {
  primaryColor: string | null;
  secondaryColor: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  fontFamily: string | null;
  logoFileId: string | null;
  logoUrl: string | null;
  coverFileId: string | null;
  coverUrl: string | null;
  hidePlatformBadge: boolean;
  /** هل الباقة الحالية تسمح فعلاً بإخفاء الشعار؟ */
  hidePlatformBadgeAllowed: boolean;
  updatedAt: string | null;
}

export interface BrandPolicySummary {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  branchId: string | null;
  branchName: string | null;
  templateKey: string | null;
  lockedFields: LockableField[];
  requireApproval: boolean;
  enforcedValues: Record<string, unknown> | null;
  isActive: boolean;
}

/**
 * السياسة السارية على بطاقة بعينها بعد حلّ الأخص.
 *
 * `sourcePolicyId` معروض عمداً: موظف يرى حقلاً مقفلاً يسأل «من أقفله؟»،
 * والإجابة «سياسة إدارتك» تختلف عن «سياسة المؤسسة».
 */
export interface EffectiveCardPolicy {
  sourcePolicyId: string | null;
  sourceScope: 'department' | 'branch' | 'organization' | 'none';
  templateKey: string | null;
  lockedFields: LockableField[];
  requireApproval: boolean;
  enforcedValues: Record<string, unknown> | null;
}

export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'stale';

export interface ChangeRequestSummary {
  id: string;
  cardId: string;
  cardSlug: string;
  requestedByUserId: string;
  requestedByName: string | null;
  status: ChangeRequestStatus;
  /** أسماء الحقول المطلوب تعديلها — لا القيم، فالقائمة تُعرض للمراجع. */
  changedFields: string[];
  baseRevision: number;
  /** هل ما زال الطلب قابلاً للتطبيق على الإصدار الحالي؟ */
  applicable: boolean;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ChangeRequestDetail extends ChangeRequestSummary {
  payload: Record<string, unknown>;
  /** القيم الحالية للحقول المطلوب تعديلها — لعرض «قبل/بعد». */
  currentValues: Record<string, unknown>;
}

export type CustomDomainStatus = 'pending' | 'verifying' | 'active' | 'failed' | 'disabled';

export interface CustomDomainSummary {
  id: string;
  hostname: string;
  status: CustomDomainStatus;
  /** اسم سجل TXT وقيمته — يُعرضان للعميل ليضعهما في DNS. */
  verificationRecordName: string;
  verificationToken: string;
  verifiedAt: string | null;
  failureReason: string | null;
}
