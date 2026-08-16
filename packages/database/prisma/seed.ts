import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ key: string; description: string }> = [
  { key: 'organizations:manage', description: 'إدارة إعدادات المؤسسة' },
  { key: 'members:manage', description: 'دعوة الأعضاء وإدارة أدوارهم' },
  { key: 'cards:read', description: 'قراءة بطاقات المؤسسة' },
  { key: 'cards:write', description: 'إنشاء وتعديل البطاقات' },
  { key: 'cards:publish', description: 'نشر البطاقات وإلغاء نشرها' },
  { key: 'cards:approve', description: 'الموافقة على طلبات تعديل البطاقات' },
  { key: 'contacts:read', description: 'قراءة جهات الاتصال' },
  { key: 'contacts:export', description: 'تصدير جهات الاتصال' },
  { key: 'analytics:read', description: 'قراءة التحليلات' },
  { key: 'audit:read', description: 'قراءة سجل التدقيق' },
  { key: 'directory:read', description: 'قراءة دليل الموظفين' },
  { key: 'branding:manage', description: 'إدارة الهوية المؤسسية والقوالب والسياسات' },
  { key: 'billing:read', description: 'قراءة الاشتراك والفواتير' },
  { key: 'billing:manage', description: 'تغيير الباقة والدفع والإلغاء' },
  { key: 'support:manage', description: 'فتح تذاكر الدعم ومتابعتها' },
  { key: 'presence:manage', description: 'إدارة وسوم NFC والحملات' },
];

/**
 * الأدوار النظامية وصلاحياتها — مبدأ Deny by default.
 *
 * `scopedOnly` تعني أن الدور لا يُسنَد على المؤسسة كلها بل في
 * membership_scopes مقيَّداً بإدارة أو فرع (§9.2).
 */
const SYSTEM_ROLES: Array<{
  key: string;
  name: string;
  nameEn: string;
  permissions: string[];
  scopedOnly?: boolean;
}> = [
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
      'cards:approve',
      'contacts:read',
      'contacts:export',
      'analytics:read',
      'directory:read',
      'branding:manage',
      'billing:read',
      'support:manage',
      'presence:manage',
    ],
  },
  {
    key: 'member',
    name: 'عضو',
    nameEn: 'Member',
    permissions: ['cards:read', 'cards:write', 'contacts:read', 'directory:read'],
  },
  {
    key: 'department_admin',
    name: 'مسؤول إدارة',
    nameEn: 'Department Admin',
    scopedOnly: true,
    permissions: [
      'members:manage',
      'cards:read',
      'cards:write',
      'cards:publish',
      'cards:approve',
      'analytics:read',
      'directory:read',
    ],
  },
  {
    key: 'branch_admin',
    name: 'مسؤول فرع',
    nameEn: 'Branch Admin',
    scopedOnly: true,
    permissions: [
      'members:manage',
      'cards:read',
      'cards:write',
      'cards:publish',
      'cards:approve',
      'analytics:read',
      'directory:read',
    ],
  },
];

/**
 * الباقات الافتتاحية (§9.4).
 *
 * صفوف لا ثوابت: مسؤول المنصة يعدّلها من اللوحة، والتهيئة تنشئها إن
 * غابت ولا تدهس سعراً عُدّل لاحقاً — تغيير سعر في الإنتاج قرار تجاري
 * لا يجوز أن يعكسه تشغيل `db:seed`.
 *
 * الحدّ ‎-1 = بلا حد. المبالغ بالبيسة (1 ريال = 1000 بيسة).
 */
const PLANS: Array<{
  key: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  limits: Record<string, number>;
  features: string[];
  trialDays: number;
  isPublic: boolean;
  sortOrder: number;
  prices: Array<{ interval: string; amountBaisa: number }>;
}> = [
  {
    key: 'free',
    name: 'المجانية',
    nameEn: 'Free',
    description: 'بطاقة واحدة لتجربة المنصة.',
    descriptionEn: 'A single card to try the platform.',
    limits: { maxCards: 1, maxMembers: 1, maxDepartments: 0, maxBranches: 0, maxContacts: 100 },
    features: [],
    trialDays: 0,
    isPublic: true,
    sortOrder: 0,
    prices: [],
  },
  {
    key: 'pro',
    name: 'الاحترافية',
    nameEn: 'Pro',
    description: 'للمحترف المستقل — بطاقات متعددة وتحليلات كاملة.',
    descriptionEn: 'For independent professionals — multiple cards and full analytics.',
    limits: { maxCards: 5, maxMembers: 1, maxDepartments: 0, maxBranches: 0, maxContacts: 2000 },
    // المحترف المستقل يحتاج حضوره في البريد والاجتماعات والمحفظة —
    // وهي نقاط تواصل فردية. الوسوم والحملات تبدأ من باقة الفرق: كلاهما
    // يُدار مركزياً ولا معنى له لمن يدير نفسه.
    features: [
      'remove_platform_badge',
      'contacts_export',
      'email_signature',
      'meeting_backgrounds',
      'wallet_passes',
    ],
    trialDays: 14,
    isPublic: true,
    sortOrder: 1,
    prices: [
      { interval: 'month', amountBaisa: 3_000 },
      { interval: 'year', amountBaisa: 30_000 },
    ],
  },
  {
    key: 'business',
    name: 'الفرق والشركات',
    nameEn: 'Business',
    description: 'إدارة فريق وهوية موحّدة ودليل موظفين.',
    descriptionEn: 'Team management, unified branding and an employee directory.',
    limits: {
      maxCards: 100,
      maxMembers: 100,
      maxDepartments: 25,
      maxBranches: 25,
      maxContacts: 25_000,
    },
    features: [
      'remove_platform_badge',
      'contacts_export',
      'team_management',
      'brand_kit',
      'locked_fields',
      'approval_workflow',
      'csv_import',
      'employee_directory',
      'email_signature',
      'meeting_backgrounds',
      'wallet_passes',
      'nfc_tags',
      'campaigns',
    ],
    trialDays: 14,
    isPublic: true,
    sortOrder: 2,
    prices: [
      { interval: 'month', amountBaisa: 5_000 },
      { interval: 'year', amountBaisa: 50_000 },
    ],
  },
  {
    key: 'enterprise',
    name: 'المؤسسات',
    nameEn: 'Enterprise',
    description: 'بلا حدود عددية، مع نطاق مخصص ودعم مخصّص.',
    descriptionEn: 'No numeric limits, with a custom domain and dedicated support.',
    limits: {
      maxCards: -1,
      maxMembers: -1,
      maxDepartments: -1,
      maxBranches: -1,
      maxContacts: -1,
    },
    features: [
      'remove_platform_badge',
      'contacts_export',
      'team_management',
      'brand_kit',
      'locked_fields',
      'approval_workflow',
      'csv_import',
      'employee_directory',
      'custom_domain',
      'priority_support',
      'email_signature',
      'meeting_backgrounds',
      'wallet_passes',
      'nfc_tags',
      'campaigns',
    ],
    trialDays: 0,
    // تُباع بالتفاوض: سعرها ليس رقماً واحداً يصلح لصفحة أسعار.
    isPublic: false,
    sortOrder: 3,
    prices: [],
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

    const scope = role.scopedOnly ? ' (بنطاق فقط)' : '';
    console.warn(`  ✓ دور ${role.key} — ${permissions.length} صلاحية${scope}`);
  }

  await seedPlans();

  // بيئة التطوير وحدها: الـslug مورد عالمي، وإنشاؤه في Staging أو
  // الإنتاج يحجز رابطاً حقيقياً على بطاقة وهمية.
  if (process.env.NODE_ENV === 'development') {
    await seedDemoCard();
  }

  console.warn('✔ اكتملت التهيئة.');
}

/**
 * ينشئ الباقات الغائبة ولا يدهس الموجودة.
 *
 * upsert بـ`update: {}` مقصود: الاسم والوصف والحد والسعر كلها قابلة
 * للتعديل من لوحة المنصة، وإعادة كتابتها في كل تهيئة كانت ستُرجع كل
 * قرار تجاري إلى قيمته الافتتاحية عند أول نشر.
 */
async function seedPlans(): Promise<void> {
  for (const plan of PLANS) {
    const record = await prisma.plan.upsert({
      where: { key: plan.key },
      update: {},
      create: {
        key: plan.key,
        name: plan.name,
        nameEn: plan.nameEn,
        description: plan.description,
        descriptionEn: plan.descriptionEn,
        limits: plan.limits,
        features: plan.features,
        trialDays: plan.trialDays,
        isPublic: plan.isPublic,
        sortOrder: plan.sortOrder,
      },
    });

    for (const price of plan.prices) {
      await prisma.planPrice.upsert({
        where: {
          planId_interval_currency: {
            planId: record.id,
            interval: price.interval,
            currency: 'OMR',
          },
        },
        update: {},
        create: {
          planId: record.id,
          interval: price.interval,
          currency: 'OMR',
          amountBaisa: price.amountBaisa,
        },
      });
    }

    console.warn(`  ✓ باقة ${plan.key} — ${plan.prices.length} سعر`);
  }
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
