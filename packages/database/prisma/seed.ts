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

  // بيئة التطوير وحدها: الـslug مورد عالمي، وإنشاؤه في Staging أو
  // الإنتاج يحجز رابطاً حقيقياً على بطاقة وهمية.
  if (process.env.NODE_ENV === 'development') {
    await seedDemoCard();
  }

  console.warn('✔ اكتملت التهيئة.');
}

/**
 * بطاقة منشورة للتطوير والاختبار الآلي.
 *
 * الصفحة العامة تُقدَّم من لقطة منشورة، فبدون بطاقة منشورة لا يمكن
 * فتح `/${DEMO_SLUG}` محلياً ولا تشغيل اختبارات Playwright عليها.
 */
const DEMO_SLUG = 'demo-card';

async function seedDemoCard(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: 'demo@nomiqa.local' },
    update: {},
    create: {
      auth0UserId: 'seed|demo-user',
      email: 'demo@nomiqa.local',
      emailVerified: true,
      fullName: 'حساب تجريبي',
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: 'demo-workspace' },
    update: {},
    create: { slug: 'demo-workspace', name: 'مساحة تجريبية', kind: 'personal' },
  });

  const ownerRole = await prisma.role.findFirst({ where: { organizationId: null, key: 'owner' } });
  if (ownerRole) {
    const membership = await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: { organizationId: organization.id, userId: user.id },
      },
      update: {},
      create: {
        organizationId: organization.id,
        userId: user.id,
        status: 'active',
        joinedAt: new Date(),
      },
    });

    await prisma.membershipRole.upsert({
      where: { membershipId_roleId: { membershipId: membership.id, roleId: ownerRole.id } },
      update: {},
      create: { membershipId: membership.id, roleId: ownerRole.id },
    });
  }

  const existing = await prisma.card.findUnique({ where: { slug: DEMO_SLUG } });
  if (existing) {
    console.warn(`  ✓ بطاقة تجريبية موجودة على /${DEMO_SLUG}`);
    return;
  }

  const card = await prisma.card.create({
    data: {
      organizationId: organization.id,
      ownerUserId: user.id,
      slug: DEMO_SLUG,
      status: 'published',
      templateKey: 'classic',
      templateVersion: 1,
      defaultLocale: 'ar',
      theme: { primaryColor: '#0F766E', borderRadius: 'large', colorScheme: 'system' },
      sectionOrder: ['identity', 'actions', 'links'],
      // النموذج مفعَّل في البطاقة التجريبية وحدها: مساره الوحيد للاختبار
      // محلياً وفي Playwright هو صفحة عامة، ولا يمكن فتحها بلا نموذج منشور.
      contactForm: {
        enabled: true,
        fields: [
          { key: 'email', required: true },
          { key: 'phone', required: false },
          { key: 'organizationName', required: false },
          { key: 'message', required: false },
        ],
        customFields: [],
      },
      publishedAt: new Date(),
      localizations: {
        create: [
          {
            locale: 'ar',
            fullName: 'سالم الهنائي',
            jobTitle: 'مدير المنتج',
            organizationName: 'نمِقة',
            bio: 'بطاقة تجريبية للتطوير المحلي.',
            addressLine: 'مسقط، سلطنة عُمان',
          },
          {
            locale: 'en',
            fullName: 'Salim Al Hinai',
            jobTitle: 'Product Manager',
            organizationName: 'Nomiqa',
            bio: 'A demo card for local development.',
            addressLine: 'Muscat, Oman',
          },
        ],
      },
      links: {
        create: [
          { type: 'phone', value: '+96891234567', position: 0, isPrimary: true },
          { type: 'whatsapp', value: '+96891234567', position: 1, isPrimary: true },
          { type: 'email', value: 'demo@nomiqa.local', position: 2 },
          { type: 'website', value: 'https://nomiqa.example', position: 3 },
        ],
      },
    },
    include: { localizations: true, links: true },
  });

  await prisma.cardPublication.create({
    data: {
      cardId: card.id,
      revision: card.revision,
      templateKey: card.templateKey,
      templateVersion: card.templateVersion,
      publishedBy: user.id,
      // نفس بنية اللقطة التي يبنيها الـAPI عند النشر.
      snapshot: {
        slug: card.slug,
        templateKey: card.templateKey,
        templateVersion: card.templateVersion,
        defaultLocale: card.defaultLocale,
        theme: card.theme,
        sectionOrder: card.sectionOrder,
        content: Object.fromEntries(
          card.localizations.map((entry) => [
            entry.locale,
            {
              locale: entry.locale,
              fullName: entry.fullName,
              jobTitle: entry.jobTitle,
              organizationName: entry.organizationName,
              department: entry.department,
              bio: entry.bio,
              addressLine: entry.addressLine,
            },
          ]),
        ),
        links: card.links
          .filter((link) => link.isVisible)
          .sort((first, second) => first.position - second.position)
          .map((link) => ({
            id: link.id,
            type: link.type,
            platform: link.platform,
            label: link.label,
            labelEn: link.labelEn,
            value: link.value,
            position: link.position,
            isVisible: link.isVisible,
            isPrimary: link.isPrimary,
          })),
        media: { avatarUrl: null, coverUrl: null, logoUrl: null },
        contactForm: card.contactForm,
      },
    },
  });

  console.warn(`  ✓ بطاقة تجريبية منشورة على /${DEMO_SLUG}`);
}

main()
  .catch((error) => {
    console.error('✖ فشلت التهيئة:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
