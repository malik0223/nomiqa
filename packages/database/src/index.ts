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
  CONTACTS_READ: 'contacts:read',
  CONTACTS_EXPORT: 'contacts:export',
  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
} as const;

export const SYSTEM_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;
