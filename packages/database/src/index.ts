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

/**
 * ينفّذ عملاً داخل Transaction بعد ضبط سياق المؤسسة لسياسات RLS.
 *
 * حرجٌ عند استخدام Connection Pool: `SET LOCAL` مقيّد بالـTransaction،
 * فلا يتسرّب سياق مؤسسة إلى اتصال يُعاد استخدامه لمؤسسة أخرى.
 * راجع وثيقة المعمارية §6.3.
 *
 * هذه طبقة دفاع ثانية فقط — التقييد الأساسي يبقى مسؤولية طبقة
 * Repository التي تضيف organizationId إلى كل استعلام.
 */
export async function withTenantContext<T>(
  prisma: PrismaClient,
  organizationId: string,
  work: (tx: TenantScopedClient) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(organizationId)) {
    // حماية من الحقن عبر قيمة سياق غير موثوقة.
    throw new Error(`معرّف مؤسسة غير صالح: ${organizationId}`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return work(tx);
  });
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
