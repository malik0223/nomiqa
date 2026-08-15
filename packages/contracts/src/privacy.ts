/** أغراض المعالجة التي تُطلب لها موافقة منفصلة. */
export const CONSENT_PURPOSES = ['terms', 'privacy', 'marketing'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * الموافقات الإلزامية لاستخدام الخدمة.
 * التسويق **ليس** منها عمداً — اشتراطه يجعل الموافقة غير حرة.
 */
export const REQUIRED_CONSENTS: readonly ConsentPurpose[] = ['terms', 'privacy'];

export interface ConsentStatus {
  purpose: ConsentPurpose;
  granted: boolean;
  documentVersion: string | null;
  currentVersion: boolean;
  updatedAt: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
  locale: string;
  timeZone: string;
  createdAt: string;
}

export const DATA_REQUEST_TYPES = ['export', 'deletion', 'rectification'] as const;
export type DataRequestType = (typeof DATA_REQUEST_TYPES)[number];

export interface DataRequestSummary {
  id: string;
  type: DataRequestType;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: string;
  completedAt: string | null;
}

/** حمولة مهمة حذف الحساب في الطابور. */
export interface AccountDeletionJobData {
  requestId: string;
  userId: string;
  auth0UserId: string;
}

/** نسخة بيانات المستخدم القابلة للتنزيل (§6.2). */
export interface UserDataExport {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    locale: string;
    timeZone: string;
    createdAt: string;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    roles: string[];
    joinedAt: string | null;
  }>;
  consents: Array<{
    purpose: string;
    granted: boolean;
    documentVersion: string;
    recordedAt: string;
  }>;
}
