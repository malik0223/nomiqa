/**
 * أنواع إدارة الفريق والهيكل التنظيمي (خارطة الطريق §9.2).
 */

export type ScopeType = 'department' | 'branch';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DepartmentNode {
  id: string;
  parentId: string | null;
  name: string;
  nameEn: string | null;
  code: string | null;
  memberCount: number;
  children: DepartmentNode[];
}

export interface BranchSummary {
  id: string;
  name: string;
  nameEn: string | null;
  code: string | null;
  city: string | null;
  country: string | null;
  addressLine: string | null;
  phone: string | null;
  memberCount: number;
}

/** تفويض إداري بنطاق — دور مقيَّد بإدارة أو فرع. */
export interface MemberScope {
  id: string;
  roleKey: string;
  roleName: string;
  scopeType: ScopeType;
  scopeId: string;
  scopeName: string;
}

export interface MemberSummary {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string;
  status: string;
  roles: string[];
  scopes: MemberScope[];
  departmentId: string | null;
  departmentName: string | null;
  branchId: string | null;
  branchName: string | null;
  jobTitle: string | null;
  employeeNo: string | null;
  directoryVisible: boolean;
  cardCount: number;
  joinedAt: string | null;
  offboardedAt: string | null;
}

export interface InvitationSummary {
  id: string;
  email: string;
  roleKey: string;
  status: InvitationStatus;
  departmentName: string | null;
  branchName: string | null;
  jobTitle: string | null;
  expiresAt: string;
  createdAt: string;
}

/**
 * الدعوة كما يراها **المدعو** قبل القبول.
 *
 * اسم المؤسسة ودورها فقط — لا أعضاء ولا أعداد ولا أي شيء عن عملها.
 * من يملك رابط دعوة ليس عضواً بعد، وقد لا يصبح.
 */
export interface InvitationPreview {
  organizationName: string;
  roleKey: string;
  jobTitle: string | null;
  expiresAt: string;
  /** هل بريد الدعوة يطابق بريد الحساب الحالي؟ */
  emailMatches: boolean;
}

/** مدخل في دليل الموظفين. */
export interface DirectoryEntry {
  membershipId: string;
  userId: string;
  fullName: string | null;
  jobTitle: string | null;
  departmentName: string | null;
  branchName: string | null;
  /** رابط البطاقة المنشورة إن وُجدت — لا بيانات اتصال هنا. */
  cardSlug: string | null;
  avatarUrl: string | null;
}

export interface ImportRowError {
  row: number;
  /** مفتاح رسالة مترجَم في الواجهة — لا نص حر ولا قيمة الحقل. */
  reason: string;
  field?: string;
}

export interface EmployeeImportSummary {
  id: string;
  fileName: string;
  status: ImportStatus;
  createCards: boolean;
  sendInvites: boolean;
  totalRows: number;
  invitedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  rowErrors: ImportRowError[];
  failureReason: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** مهمة استيراد الموظفين في الطابور. */
export interface EmployeeImportJobData {
  importId: string;
  organizationId: string;
  actorUserId: string;
  /** الصفوف بعد التحقق الأولي — لا يُقرأ الملف مرتين. */
  rows: EmployeeImportRow[];
}

export interface EmployeeImportRow {
  rowNumber: number;
  email: string;
  fullName: string | null;
  jobTitle: string | null;
  employeeNo: string | null;
  departmentCode: string | null;
  branchCode: string | null;
  roleKey: string | null;
}
