import { PrismaClient } from '@nomiqa/database';
import { restrictedDatabaseUrl } from './global-setup.js';

/** عميل بصلاحيات كاملة — للتهيئة والتنظيف فقط، لا للتأكيدات. */
export const admin = new PrismaClient();

/** عميل بالدور المقيّد — كل التأكيدات تمر من هنا. */
export const app = new PrismaClient({ datasourceUrl: restrictedDatabaseUrl() });

export interface TenantFixture {
  organizationId: string;
  userId: string;
  membershipId: string;
  roleKey: string;
}

/**
 * يحذف كل بيانات الاختبار.
 * الترتيب يحترم المفاتيح الأجنبية؛ ننفّذه بالعميل الإداري لأن
 * الحذف الشامل عبر RLS يتطلب سياقاً لكل مؤسسة على حدة.
 */
export async function resetData(): Promise<void> {
  // البطاقات مذكورة صراحةً رغم أن CASCADE على organizations يكفي:
  // الاعتماد الضمني على الترتيب يجعل حذف مفتاح أجنبي مستقبلاً يترك
  // صفوفاً تسرّب بين حالات الاختبار.
  await admin.$executeRawUnsafe(`
    TRUNCATE TABLE
      outbox_events, audit_logs, membership_roles, membership_scopes, file_objects,
      notification_deliveries, user_consents, data_subject_requests,
      platform_audit_logs, platform_admins, feature_flag_overrides,
      analytics_rollups, card_events,
      follow_up_tasks, contact_tags, contact_notes, contact_consents,
      contacts, tags,
      support_messages, support_tickets,
      payments, payment_events, invoice_lines, invoices,
      subscription_events, subscriptions, coupon_redemptions, coupons,
      plan_prices, plans,
      card_change_requests, brand_policies, brand_kits, custom_domains,
      invitations, employee_imports, departments, branches,
      card_publications, card_links, card_localizations, cards,
      organization_memberships, organizations, users
    RESTART IDENTITY CASCADE
  `);
}

/** يضمن وجود دور نظامي بصلاحياته دون الاعتماد على تشغيل db:seed. */
export async function ensureSystemRole(key: string, permissionKeys: string[]): Promise<string> {
  const existing = await admin.role.findFirst({ where: { organizationId: null, key } });
  const role = existing ?? (await admin.role.create({ data: { key, name: key, isSystem: true } }));

  for (const permissionKey of permissionKeys) {
    const permission = await admin.permission.upsert({
      where: { key: permissionKey },
      update: {},
      create: { key: permissionKey },
    });

    await admin.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }

  return role.id;
}

/** ينشئ مؤسسة ومستخدماً وعضوية نشطة بينهما. */
export async function createTenant(
  label: string,
  options: { roleId?: string; roleKey?: string; status?: string; revoked?: boolean } = {},
): Promise<TenantFixture> {
  const organization = await admin.organization.create({
    data: { slug: `org-${label}-${Date.now()}`, name: `مؤسسة ${label}`, kind: 'business' },
  });

  const user = await admin.user.create({
    data: {
      auth0UserId: `auth0|${label}-${Date.now()}`,
      email: `${label}.${Date.now()}@test.local`,
      emailVerified: true,
    },
  });

  const membership = await admin.organizationMembership.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      status: options.status ?? 'active',
      joinedAt: new Date(),
      revokedAt: options.revoked ? new Date() : null,
      ...(options.roleId ? { roles: { create: { roleId: options.roleId } } } : {}),
    },
  });

  return {
    organizationId: organization.id,
    userId: user.id,
    membershipId: membership.id,
    roleKey: options.roleKey ?? 'member',
  };
}

/**
 * ينفّذ عملاً بالدور المقيّد بعد ضبط سياق RLS داخل Transaction.
 * يحاكي تماماً ما يجب أن يفعله التطبيق في الإنتاج.
 */
export async function asOrganization<T>(
  organizationId: string,
  work: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return work(tx);
  });
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([admin.$disconnect(), app.$disconnect()]);
}
