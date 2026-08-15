/**
 * عقود جهات الاتصال (§8.2 و§8.3 من خارطة الطريق).
 *
 * تنبيه يخص كل نوع في هذا الملف: هذه بيانات شخصية **لطرف ثالث** لم
 * يسجّل في المنصة. أي حقل يُضاف هنا يجب أن يمر على سجل المعالجة في
 * docs/privacy/processing-records.md قبل أن يُخزَّن.
 */

/** مصدر جهة الاتصال — يظهر في القائمة ويفسّر كيف وصلت. */
export const CONTACT_SOURCES = ['card_form', 'manual', 'import'] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export const CONTACT_FOLLOW_UP_STATUSES = ['new', 'in_progress', 'done', 'archived'] as const;
export type ContactFollowUpStatus = (typeof CONTACT_FOLLOW_UP_STATUSES)[number];

/**
 * أغراض موافقة الزائر.
 *
 * `contact_storage` شرط الحفظ نفسه؛ `marketing` منفصل تماماً عنه —
 * دمجهما في مربع واحد يبطل الاثنين معاً أمام أي مراجعة حماية بيانات.
 */
export const CONTACT_CONSENT_PURPOSES = ['contact_storage', 'marketing'] as const;
export type ContactConsentPurpose = (typeof CONTACT_CONSENT_PURPOSES)[number];

/**
 * إصدار نص الموافقة المعروض في النموذج العام.
 *
 * يُخزَّن مع كل موافقة. **أي تعديل على نص الموافقة في ملفات الترجمة
 * يوجب رفع هذا الرقم** — وإلا صار لدينا موافقات مسجَّلة على نص لا
 * نعرف صيغته وقت منحها، وهو ما لا يصلح إثباتاً.
 */
export const CONTACT_CONSENT_VERSION = '2026-08-16';

export const FOLLOW_UP_TASK_STATUSES = ['open', 'done', 'cancelled'] as const;
export type FollowUpTaskStatus = (typeof FOLLOW_UP_TASK_STATUSES)[number];

export interface TagData {
  id: string;
  name: string;
  color: string | null;
  /** عدد جهات الاتصال الموسومة — تُحسب عند طلب القائمة فقط. */
  contactCount?: number;
}

export interface ContactNoteData {
  id: string;
  body: string;
  authorUserId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpTaskData {
  id: string;
  title: string;
  dueAt: string;
  status: FollowUpTaskStatus;
  assignedUserId: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** سجل موافقة كما يُعرض لصاحب البطاقة — للإثبات لا للتعديل. */
export interface ContactConsentData {
  id: string;
  purpose: ContactConsentPurpose;
  granted: boolean;
  consentTextVersion: string;
  source: string;
  createdAt: string;
}

/** الصف في قائمة جهات الاتصال. */
export interface ContactSummary {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  jobTitle: string | null;
  source: ContactSource;
  followUpStatus: ContactFollowUpStatus;
  followUpAt: string | null;
  cardId: string | null;
  cardSlug: string | null;
  tags: TagData[];
  /** موسومة كتكرار لجهة اتصال أقدم. لا تُحذف آلياً — راجع تعليق النموذج. */
  isDuplicate: boolean;
  noteCount: number;
  capturedAt: string;
}

export interface ContactDetail extends ContactSummary {
  message: string | null;
  locale: string;
  customFields: Record<string, string>;
  duplicateOfId: string | null;
  notes: ContactNoteData[];
  followUps: FollowUpTaskData[];
  consents: ContactConsentData[];
  updatedAt: string;
}

/** ملخص يظهر في أعلى القائمة وفي لوحة المستخدم. */
export interface ContactStats {
  total: number;
  new: number;
  inProgress: number;
  dueFollowUps: number;
  last7Days: number;
  last30Days: number;
}

/**
 * استجابة النموذج العام.
 *
 * لا تُرجع معرّف جهة الاتصال ولا أي حقل منها: الزائر مجهول، وإرجاع
 * معرّف يمنحه مقبضاً على صف لا يملك حق قراءته.
 */
export interface ContactSubmissionResult {
  accepted: true;
  /** رسالة التأكيد المعروضة للزائر، بلغة النموذج. */
  message: string;
}
