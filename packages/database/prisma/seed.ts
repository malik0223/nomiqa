import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ key: string; description: string }> = [
  { key: 'organizations:manage', description: 'إدارة إعدادات المؤسسة' },
  { key: 'members:manage', description: 'دعوة الأعضاء وإدارة أدوارهم' },
  { key: 'cards:read', description: 'قراءة بطاقات المؤسسة' },
  { key: 'cards:write', description: 'إنشاء وتعديل البطاقات' },
  { key: 'cards:publish', description: 'نشر البطاقات وإلغاء نشرها' },
  { key: 'contacts:read', description: 'قراءة جهات الاتصال' },
  { key: 'contacts:export', description: 'تصدير جهات الاتصال' },
  { key: 'analytics:read', description: 'قراءة التحليلات' },
  { key: 'audit:read', description: 'قراءة سجل التدقيق' },
];

/** الأدوار النظامية وصلاحياتها — مبدأ Deny by default. */
const SYSTEM_ROLES: Array<{ key: string; name: string; nameEn: string; permissions: string[] }> = [
  {
    key: 'owner',
    name: 'مالك المؤسسة',
    nameEn: 'Organization Owner',
    permissions: PERMISSIONS.map((p) => p.key),
  },
  {
    key: 'admin',
    name: 'مسؤول',
    nameEn: 'Organization Admin',
    permissions: [
      'members:manage',
      'cards:read',
      'cards:write',
      'cards:publish',
      'contacts:read',
      'contacts:export',
      'analytics:read',
    ],
  },
  {
    key: 'member',
    name: 'عضو',
    nameEn: 'Member',
    permissions: ['cards:read', 'cards:write', 'contacts:read'],
  },
];

async function main() {
  console.warn('▶ بدء تهيئة البيانات الأساسية...');

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
  }
  console.warn(`  ✓ ${PERMISSIONS.length} صلاحية`);

  for (const role of SYSTEM_ROLES) {
    // الأدوار النظامية لها organizationId = null، وPrisma لا تقبل null
    // داخل مفتاح فريد مركّب في where، لذا نبحث أولاً ثم ننشئ أو نحدّث.
    const existing = await prisma.role.findFirst({
      where: { organizationId: null, key: role.key },
    });

    const created = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { name: role.name, nameEn: role.nameEn },
        })
      : await prisma.role.create({
          data: {
            key: role.key,
            name: role.name,
            nameEn: role.nameEn,
            isSystem: true,
          },
        });

    const permissions = await prisma.permission.findMany({
      where: { key: { in: role.permissions } },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: created.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: created.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    console.warn(`  ✓ دور ${role.key} — ${permissions.length} صلاحية`);
  }

  console.warn('✔ اكتملت التهيئة.');
}

main()
  .catch((error) => {
    console.error('✖ فشلت التهيئة:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
