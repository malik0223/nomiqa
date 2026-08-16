import { PrismaClient, Prisma } from '@prisma/client';

export * from '@prisma/client';
export { Prisma };

let client: PrismaClient | undefined;

/**
 * عميل Prisma مشترك. يُعاد استخدامه لتجنّب استنزاف Connection Pool
 * عند إعادة التحميل السريع في بيئة التطوير.
 */
export function getPrismaClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }
  return client;
}

export type TenantScopedClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface RlsContext {
  /** يتيح للمستخدم قراءة عضوياته الخاصة عبر كل المؤسسات. */
  userId?: string;
  /** يقصر الوصول على صفوف مؤسسة واحدة. */
  organizationId?: string;
}

/**
 * ينفّذ عملاً داخل Transaction بعد ضبط سياق RLS.
 *
 * حرجٌ عند استخدام Connection Pool: `SET LOCAL` مقيّد بالـTransaction،
 * فلا يتسرّب سياق إلى اتصال يُعاد استخدامه لمؤسسة أخرى (§6.3).
 *
 * ضبط السياق **لا يمنح صلاحية**؛ السياسات تقرر ما يُرى، والتحقق من
 * العضوية والصلاحيات يبقى في طبقة التطبيق.
 */
export async function withRlsContext<T>(
  prisma: PrismaClient,
  context: RlsContext,
  work: (tx: TenantScopedClient) => Promise<T>,
): Promise<T> {
  // حماية من الحقن عبر قيمة سياق غير موثوقة.
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined && !UUID_PATTERN.test(value)) {
      throw new Error(`قيمة سياق غير صالحة لـ${key}`);
    }
  }

  return prisma.$transaction(async (tx) => {
    if (context.userId) {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${context.userId}, true)`;
    }
    if (context.organizationId) {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true)`;
    }
    return work(tx);
  });
}

/** اختصار للحالة الشائعة: سياق مؤسسة واحدة. */
export async function withTenantContext<T>(
  prisma: PrismaClient,
  organizationId: string,
  work: (tx: TenantScopedClient) => Promise<T>,
): Promise<T> {
  return withRlsContext(prisma, { organizationId }, work);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** مفاتيح الصلاحيات النظامية — مصدر واحد للحقيقة. */
export const PERMISSIONS = {
  ORG_MANAGE: 'organizations:manage',
  ORG_MEMBERS_MANAGE: 'members:manage',
  CARDS_READ: 'cards:read',
  CARDS_WRITE: 'cards:write',
  CARDS_PUBLISH: 'cards:publish',
  /// الموافقة على طلبات تعديل البطاقات (§9.3).
  CARDS_APPROVE: 'cards:approve',
  CONTACTS_READ: 'contacts:read',
  CONTACTS_EXPORT: 'contacts:export',
  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
  /// قراءة دليل الموظفين.
  DIRECTORY_READ: 'directory:read',
  /// تعديل هوية المؤسسة وقوالبها وسياساتها.
  BRANDING_MANAGE: 'branding:manage',
  /// قراءة الاشتراك والفواتير.
  BILLING_READ: 'billing:read',
  /**
   * تغيير الباقة والدفع والإلغاء.
   *
   * منفصلة عن القراءة عمداً: محاسب المؤسسة يحتاج الفواتير ولا يحتاج
   * صلاحية خفض الباقة، ودمجهما كان يجعل كل من يطّلع على فاتورة قادراً
   * على إلغاء الخدمة.
   */
  BILLING_MANAGE: 'billing:manage',
  /// فتح تذاكر الدعم ومتابعتها.
  SUPPORT_MANAGE: 'support:manage',
  /**
   * إدارة وسوم NFC والحملات (§10).
   *
   * صلاحية واحدة للاثنين لا صلاحيتان: كلاهما إصدار **كود قصير يمثّل
   * المؤسسة في العالم الخارجي**، ومن يُؤتمن على إصدار وسم يُطبع على
   * معدن يُؤتمن على إصدار رمز يُطبع على لافتة.
   *
   * ومنفصلة عن `branding:manage` لأن الوسوم تشغيلية لا هوية: مسؤول
   * المعرض يوزّع وسوماً ولا يغيّر ألوان المؤسسة.
   */
  PRESENCE_MANAGE: 'presence:manage',
} as const;

export const SYSTEM_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  /**
   * أدوار التفويض المحدود (§9.2).
   *
   * لا تُسنَد في membership_roles إطلاقاً — وجودها هناك يمنح صلاحياتها
   * على المؤسسة كلها. مكانها membership_scopes مقيَّدةً بإدارة أو فرع.
   */
  DEPARTMENT_ADMIN: 'department_admin',
  BRANCH_ADMIN: 'branch_admin',
} as const;

/** الأدوار التي لا يجوز إسنادها إلا بنطاق. */
export const SCOPED_ONLY_ROLES: readonly string[] = [
  SYSTEM_ROLES.DEPARTMENT_ADMIN,
  SYSTEM_ROLES.BRANCH_ADMIN,
];

/** أنواع نطاق التفويض. */
export const SCOPE_TYPES = { DEPARTMENT: 'department', BRANCH: 'branch' } as const;
export type ScopeType = (typeof SCOPE_TYPES)[keyof typeof SCOPE_TYPES];
