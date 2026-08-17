import type {
  ApiKeySummary,
  BranchSummary,
  BrandKitPayload,
  BrandPolicySummary,
  CampaignReport,
  CampaignSummary,
  CardDetail,
  CardEntitlements,
  ChangeRequestSummary,
  ConsentStatus,
  ContactDetail,
  ContactStats,
  ContactSummary,
  CrmConnectionSummary,
  CustomDomainSummary,
  DepartmentNode,
  DirectoryEntry,
  EmployeeImportSummary,
  EventReport,
  EventSummary,
  InvitationSummary,
  InvoiceDetail,
  InvoiceSummary,
  MeResponse,
  MemberSummary,
  NfcTagSummary,
  OrganizationEntitlements,
  Paginated,
  PlanSummary,
  ScanAvailability,
  ScanJobSummary,
  SignaturePayload,
  SubscriptionSummary,
  TagData,
  TemplateSummary,
  TicketDetail,
  TicketSummary,
  UserProfile,
  WalletAvailability,
  WebhookEndpointSummary,
} from '@nomiqa/contracts';
import { sampleAnalytics, sampleCards, sampleContacts, sampleSnapshot } from '../sample-data';

/* ============================================================
   بيانات وضع العرض
   ------------------------------------------------------------
   تُستعمل حين `NOMIQA_DEMO=1` وحدها، وهو متغيّر يُشغَّل يدوياً
   لالتقاط لقطات دليل الاستخدام. الغرض واحد ومحدود: أن تُصوَّر
   **الشاشات الحقيقية** بمحتوى واقعي، بدل رسم نسخ مزيّفة منها في
   صفحة توثيق تنفصل عن التطبيق بعد أول تعديل.

   القاعدة الملزمة: هذه الوحدة لا تُستورد إلا من `api-client`
   وخلف الشرط. لا مسار إنتاجي يصل إليها، ولا قيمة هنا تُعرض لمستخدم
   حقيقي — فشل نداء الـAPI يبقى فشلاً معلناً.

   كل الأسماء والأرقام مُختلَقة ولا تخصّ أحداً.
*/

const NOW = '2026-08-16T18:40:00.000Z';
const ORG_ID = 'org_demo';

const me: MeResponse = {
  user: {
    id: 'usr_demo',
    auth0UserId: 'auth0|demo',
    email: 'sara@alwaha.example',
    emailVerified: true,
    fullName: 'سارة المعمري',
  },
  organizations: [
    {
      id: ORG_ID,
      slug: 'alwaha',
      name: 'مجموعة الواحة',
      kind: 'company',
      defaultLocale: 'ar',
      roles: ['org_admin'],
      permissions: ['cards:write', 'team:write', 'billing:write', 'branding:write'],
    },
  ],
  featureFlags: {},
};

const templates: TemplateSummary[] = [
  {
    key: 'classic',
    name: 'كلاسيكي',
    nameEn: 'Classic',
    latestVersion: 1,
    definition: {
      layout: 'centered',
      sections: ['identity', 'actions', 'links'],
      supportsCover: false,
      theme: { primaryColor: '#2a3d6f', borderRadius: 'medium', colorScheme: 'light' },
    },
  },
  {
    key: 'cover',
    name: 'بغلاف',
    nameEn: 'Cover',
    latestVersion: 1,
    definition: {
      layout: 'cover',
      sections: ['identity', 'actions', 'links'],
      supportsCover: true,
      theme: { primaryColor: '#2a3d6f', borderRadius: 'large', colorScheme: 'light' },
    },
  },
  {
    key: 'minimal',
    name: 'مبسّط',
    nameEn: 'Minimal',
    latestVersion: 1,
    definition: {
      layout: 'start',
      sections: ['identity', 'links'],
      supportsCover: false,
      theme: { primaryColor: '#2a3d6f', borderRadius: 'small', colorScheme: 'light' },
    },
  },
];

const cardDetail: CardDetail = {
  id: 'c1',
  slug: 'sara-almamari',
  status: 'published',
  templateKey: 'classic',
  templateVersion: 1,
  defaultLocale: 'ar',
  theme: { primaryColor: '#2a3d6f', borderRadius: 'medium', colorScheme: 'light' },
  sectionOrder: ['identity', 'actions', 'links'],
  revision: 12,
  content: [
    sampleSnapshot.content.ar!,
    sampleSnapshot.content.en!,
  ],
  links: sampleSnapshot.links,
  contactForm: {
    enabled: true,
    fields: [
      { key: 'email', required: true },
      { key: 'phone', required: false },
      { key: 'organizationName', required: false },
      { key: 'message', required: false },
    ],
    customFields: [
      { key: 'field_interest', label: 'ما الذي يهمّك؟', labelEn: 'What are you after?', required: false },
    ],
  },
  media: { avatarFileId: null, coverFileId: null, logoFileId: null },
  mediaPreview: { avatarUrl: null, coverUrl: null, logoUrl: null },
  publishedAt: '2026-06-02T09:15:00.000Z',
  updatedAt: '2026-08-14T11:20:00.000Z',
  hasUnpublishedChanges: false,
};

const contactDetail: ContactDetail = {
  ...sampleContacts[0]!,
  message: 'سعدت بلقائك في جناح الواحة. أرجو مشاركتي عرض الأسعار للربع القادم.',
  locale: 'ar',
  customFields: { field_interest: 'شحن بحري' },
  duplicateOfId: null,
  notes: [
    {
      id: 'n1',
      body: 'أرسلت العرض المبدئي. ينتظر ردّ إدارته قبل نهاية الأسبوع.',
      authorUserId: 'usr_demo',
      authorName: 'سارة المعمري',
      createdAt: '2026-08-16T12:05:00.000Z',
      updatedAt: '2026-08-16T12:05:00.000Z',
    },
  ],
  followUps: [
    {
      id: 'f1',
      title: 'متابعة عرض الأسعار',
      dueAt: '2026-08-19T08:00:00.000Z',
      status: 'open',
      assignedUserId: 'usr_demo',
      completedAt: null,
      createdAt: '2026-08-16T12:06:00.000Z',
    },
  ],
  consents: [
    {
      id: 'cs1',
      purpose: 'contact_storage',
      granted: true,
      consentTextVersion: '2026-08-16',
      source: 'card_form',
      createdAt: '2026-08-16T10:12:00.000Z',
    },
    {
      id: 'cs2',
      purpose: 'marketing',
      granted: false,
      consentTextVersion: '2026-08-16',
      source: 'card_form',
      createdAt: '2026-08-16T10:12:00.000Z',
    },
  ],
  updatedAt: '2026-08-16T12:06:00.000Z',
};

const contactStats: ContactStats = {
  total: 214,
  new: 37,
  inProgress: 12,
  dueFollowUps: 4,
  last7Days: 46,
  last30Days: 118,
};

const tags: TagData[] = [
  { id: 't1', name: 'معرض عُمان اللوجستي', color: '#c8a24a', contactCount: 63 },
  { id: 't2', name: 'أولوية عالية', color: '#b3352f', contactCount: 18 },
  { id: 't3', name: 'جهة حكومية', color: '#2f7d5b', contactCount: 22 },
];

const departments: DepartmentNode[] = [
  {
    id: 'd1',
    parentId: null,
    name: 'التجاري',
    nameEn: 'Commercial',
    code: 'COM',
    memberCount: 14,
    children: [
      {
        id: 'd2',
        parentId: 'd1',
        name: 'تطوير الأعمال',
        nameEn: 'Business Development',
        code: 'BD',
        memberCount: 6,
        children: [],
      },
    ],
  },
  {
    id: 'd3',
    parentId: null,
    name: 'العمليات',
    nameEn: 'Operations',
    code: 'OPS',
    memberCount: 21,
    children: [],
  },
];

const branches: BranchSummary[] = [
  {
    id: 'b1',
    name: 'المقر الرئيسي — مسقط',
    nameEn: 'HQ — Muscat',
    code: 'MCT',
    city: 'مسقط',
    country: 'عُمان',
    addressLine: 'الخوير، شارع 18 نوفمبر',
    phone: '+968 2400 0000',
    memberCount: 28,
  },
  {
    id: 'b2',
    name: 'فرع صحار',
    nameEn: 'Sohar',
    code: 'SOH',
    city: 'صحار',
    country: 'عُمان',
    addressLine: 'المنطقة الحرة',
    phone: '+968 2685 0000',
    memberCount: 7,
  },
];

const members: Paginated<MemberSummary> = {
  data: [
    {
      membershipId: 'm1',
      userId: 'usr_demo',
      fullName: 'سارة المعمري',
      email: 'sara@alwaha.example',
      status: 'active',
      roles: ['org_admin'],
      scopes: [],
      departmentId: 'd2',
      departmentName: 'تطوير الأعمال',
      branchId: 'b1',
      branchName: 'المقر الرئيسي — مسقط',
      jobTitle: 'مديرة تطوير الأعمال',
      employeeNo: 'AW-1042',
      directoryVisible: true,
      cardCount: 3,
      joinedAt: '2026-01-12T07:00:00.000Z',
      offboardedAt: null,
    },
    {
      membershipId: 'm2',
      userId: 'usr_2',
      fullName: 'يوسف الرواحي',
      email: 'yousef@alwaha.example',
      status: 'active',
      roles: ['dept_manager'],
      scopes: [
        {
          id: 's1',
          roleKey: 'dept_manager',
          roleName: 'مدير إدارة',
          scopeType: 'department',
          scopeId: 'd3',
          scopeName: 'العمليات',
        },
      ],
      departmentId: 'd3',
      departmentName: 'العمليات',
      branchId: 'b1',
      branchName: 'المقر الرئيسي — مسقط',
      jobTitle: 'مدير العمليات',
      employeeNo: 'AW-0871',
      directoryVisible: true,
      cardCount: 1,
      joinedAt: '2025-09-03T07:00:00.000Z',
      offboardedAt: null,
    },
    {
      membershipId: 'm3',
      userId: 'usr_3',
      fullName: 'ريم الشحية',
      email: 'reem@alwaha.example',
      status: 'active',
      roles: ['member'],
      scopes: [],
      departmentId: 'd2',
      departmentName: 'تطوير الأعمال',
      branchId: 'b2',
      branchName: 'فرع صحار',
      jobTitle: 'أخصائية حسابات',
      employeeNo: 'AW-1188',
      directoryVisible: true,
      cardCount: 1,
      joinedAt: '2026-03-21T07:00:00.000Z',
      offboardedAt: null,
    },
    {
      membershipId: 'm4',
      userId: 'usr_4',
      fullName: 'ماجد الهنائي',
      email: 'majid@alwaha.example',
      status: 'offboarded',
      roles: ['member'],
      scopes: [],
      departmentId: 'd3',
      departmentName: 'العمليات',
      branchId: 'b1',
      branchName: 'المقر الرئيسي — مسقط',
      jobTitle: 'منسّق شحن',
      employeeNo: 'AW-0654',
      directoryVisible: false,
      cardCount: 0,
      joinedAt: '2024-11-02T07:00:00.000Z',
      offboardedAt: '2026-07-30T07:00:00.000Z',
    },
  ],
  meta: { page: 1, pageSize: 20, total: 4, totalPages: 1 },
};

const invitations: InvitationSummary[] = [
  {
    id: 'i1',
    email: 'nasser@alwaha.example',
    roleKey: 'member',
    status: 'pending',
    departmentName: 'تطوير الأعمال',
    branchName: 'المقر الرئيسي — مسقط',
    jobTitle: 'مسؤول مبيعات',
    expiresAt: '2026-08-23T07:00:00.000Z',
    createdAt: '2026-08-16T07:00:00.000Z',
  },
];

const imports: EmployeeImportSummary[] = [
  {
    id: 'im1',
    fileName: 'employees-august.csv',
    status: 'completed',
    createCards: true,
    sendInvites: true,
    totalRows: 42,
    invitedCount: 38,
    updatedCount: 3,
    skippedCount: 0,
    errorCount: 1,
    rowErrors: [{ row: 17, reason: 'بريد إلكتروني غير صالح', field: 'email' }],
    failureReason: null,
    createdAt: '2026-08-10T09:12:00.000Z',
    finishedAt: '2026-08-10T09:14:00.000Z',
  },
];

const entitlements: OrganizationEntitlements = {
  planKey: 'business',
  planName: 'أعمال',
  status: 'active',
  limits: {
    maxCards: 100,
    maxMembers: 50,
    maxDepartments: 20,
    maxBranches: 10,
    maxContacts: 10000,
  },
  features: [
    'custom_domain',
    'brand_kit',
    'brand_policies',
    'approvals',
    'directory',
    'nfc_tags',
    'email_signature',
    'meeting_backgrounds',
    'campaigns',
    'wallet_passes',
    'events',
    'card_scan',
    'public_api',
    'webhooks',
    'crm_sync',
  ] as OrganizationEntitlements['features'],
  usage: { cards: 3, members: 28, departments: 3, branches: 2, contacts: 214 },
  trialEndsAt: null,
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  inGracePeriod: false,
};

const plans: PlanSummary[] = [
  {
    id: 'p1',
    key: 'starter',
    name: 'أساسي',
    nameEn: 'Starter',
    description: 'بطاقة واحدة لمن يبدأ.',
    descriptionEn: 'One card to get going.',
    limits: { maxCards: 1, maxMembers: 1, maxDepartments: 0, maxBranches: 0, maxContacts: 250 },
    features: [],
    trialDays: 14,
    isPublic: true,
    isActive: true,
    sortOrder: 1,
    prices: [
      { id: 'pr1', interval: 'month', currency: 'OMR', amountBaisa: 2000 },
      { id: 'pr2', interval: 'year', currency: 'OMR', amountBaisa: 20000 },
    ],
  },
  {
    id: 'p2',
    key: 'business',
    name: 'أعمال',
    nameEn: 'Business',
    description: 'للفرق التي تشارك هوية واحدة وتقيس نتائجها.',
    descriptionEn: 'For teams sharing one identity and measuring results.',
    limits: {
      maxCards: 100,
      maxMembers: 50,
      maxDepartments: 20,
      maxBranches: 10,
      maxContacts: 10000,
    },
    features: entitlements.features,
    trialDays: 14,
    isPublic: true,
    isActive: true,
    sortOrder: 2,
    prices: [
      { id: 'pr3', interval: 'month', currency: 'OMR', amountBaisa: 12000 },
      { id: 'pr4', interval: 'year', currency: 'OMR', amountBaisa: 120000 },
    ],
  },
];

const subscription: SubscriptionSummary = {
  id: 'sub1',
  planKey: 'business',
  planName: 'أعمال',
  status: 'active',
  interval: 'month',
  quantity: 28,
  amountBaisa: 12000,
  currency: 'OMR',
  currentPeriodStart: '2026-08-01T00:00:00.000Z',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  trialEndsAt: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  gracePeriodEndsAt: null,
  couponCode: null,
};

const invoices: InvoiceSummary[] = [
  {
    id: 'inv1',
    number: 'NMQ-2026-0812',
    status: 'paid',
    currency: 'OMR',
    subtotalBaisa: 12000,
    discountBaisa: 0,
    vatRateBps: 500,
    vatBaisa: 600,
    totalBaisa: 12600,
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-09-01T00:00:00.000Z',
    issuedAt: '2026-08-01T00:05:00.000Z',
    dueAt: '2026-08-08T00:00:00.000Z',
    paidAt: '2026-08-01T08:31:00.000Z',
  },
  {
    id: 'inv2',
    number: 'NMQ-2026-0711',
    status: 'paid',
    currency: 'OMR',
    subtotalBaisa: 12000,
    discountBaisa: 0,
    vatRateBps: 500,
    vatBaisa: 600,
    totalBaisa: 12600,
    periodStart: '2026-07-01T00:00:00.000Z',
    periodEnd: '2026-08-01T00:00:00.000Z',
    issuedAt: '2026-07-01T00:05:00.000Z',
    dueAt: '2026-07-08T00:00:00.000Z',
    paidAt: '2026-07-01T09:02:00.000Z',
  },
];

const invoiceDetail: InvoiceDetail = {
  ...invoices[0]!,
  lines: [
    {
      id: 'l1',
      description: 'اشتراك باقة أعمال — 28 مقعداً',
      descriptionEn: 'Business plan — 28 seats',
      quantity: 28,
      unitAmountBaisa: 429,
      amountBaisa: 12000,
    },
  ],
  billingName: 'مجموعة الواحة ش.م.م',
  billingEmail: 'finance@alwaha.example',
  billingVatNumber: 'OM1100234567',
  billingAddress: 'مسقط، الخوير، ص.ب 331',
  checkoutUrl: null,
};

const tickets: TicketSummary[] = [
  {
    id: 'tk1',
    subject: 'ربط نطاق مخصص لبطاقات الفريق',
    category: 'technical',
    priority: 'normal',
    status: 'pending_customer',
    messageCount: 3,
    createdAt: '2026-08-13T08:20:00.000Z',
    updatedAt: '2026-08-15T10:40:00.000Z',
  },
];

const ticketDetail: TicketDetail = {
  ...tickets[0]!,
  messages: [
    {
      id: 'tm1',
      authorType: 'customer',
      authorName: 'سارة المعمري',
      body: 'أضفت النطاق cards.alwaha.example لكنه ما زال في حالة تحقق منذ يومين.',
      createdAt: '2026-08-13T08:20:00.000Z',
    },
    {
      id: 'tm2',
      authorType: 'platform',
      authorName: 'فريق الدعم',
      body: 'سجلّ TXT غير منشور بعد على النطاق. أرفقنا القيمة المطلوبة في شاشة الهوية المؤسسية.',
      createdAt: '2026-08-14T06:05:00.000Z',
    },
    {
      id: 'tm3',
      authorType: 'customer',
      authorName: 'سارة المعمري',
      body: 'طلبت من مزوّد النطاق إضافته اليوم.',
      createdAt: '2026-08-15T10:40:00.000Z',
    },
  ],
};

const brandKit: BrandKitPayload = {
  primaryColor: '#2a3d6f',
  secondaryColor: '#c8a24a',
  backgroundColor: '#ffffff',
  textColor: '#161b2e',
  fontFamily: 'IBM Plex Sans Arabic',
  logoFileId: null,
  logoUrl: null,
  coverFileId: null,
  coverUrl: null,
  hidePlatformBadge: false,
  hidePlatformBadgeAllowed: true,
  updatedAt: '2026-07-19T11:00:00.000Z',
};

const brandPolicies: BrandPolicySummary[] = [
  {
    id: 'bp1',
    name: 'سياسة الفريق التجاري',
    departmentId: 'd1',
    departmentName: 'التجاري',
    branchId: null,
    branchName: null,
    templateKey: 'classic',
    lockedFields: ['organizationName', 'primaryColor', 'logo'] as BrandPolicySummary['lockedFields'],
    requireApproval: true,
    enforcedValues: { organizationName: 'مجموعة الواحة' },
    isActive: true,
  },
];

const domains: CustomDomainSummary[] = [
  {
    id: 'dm1',
    hostname: 'cards.alwaha.example',
    status: 'verifying',
    verificationRecordName: '_nomiqa.cards',
    verificationToken: 'nmq-verify-8f3a91c2',
    verifiedAt: null,
    failureReason: null,
  },
];

const changeRequests: ChangeRequestSummary[] = [
  {
    id: 'cr1',
    cardId: 'c1',
    cardSlug: 'reem-alshehiya',
    requestedByUserId: 'usr_3',
    requestedByName: 'ريم الشحية',
    status: 'pending',
    changedFields: ['jobTitle', 'links'],
    baseRevision: 7,
    applicable: true,
    reviewNote: null,
    reviewedAt: null,
    createdAt: '2026-08-16T06:40:00.000Z',
  },
];

const directory: DirectoryEntry[] = [
  {
    membershipId: 'm1',
    userId: 'usr_demo',
    fullName: 'سارة المعمري',
    jobTitle: 'مديرة تطوير الأعمال',
    departmentName: 'تطوير الأعمال',
    branchName: 'المقر الرئيسي — مسقط',
    cardSlug: 'sara-almamari',
    avatarUrl: null,
  },
  {
    membershipId: 'm2',
    userId: 'usr_2',
    fullName: 'يوسف الرواحي',
    jobTitle: 'مدير العمليات',
    departmentName: 'العمليات',
    branchName: 'المقر الرئيسي — مسقط',
    cardSlug: 'yousef-alrawahi',
    avatarUrl: null,
  },
  {
    membershipId: 'm3',
    userId: 'usr_3',
    fullName: 'ريم الشحية',
    jobTitle: 'أخصائية حسابات',
    departmentName: 'تطوير الأعمال',
    branchName: 'فرع صحار',
    cardSlug: 'reem-alshehiya',
    avatarUrl: null,
  },
];

const nfcTags: NfcTagSummary[] = [
  {
    id: 'tag1',
    code: 'K7QM2P4A',
    label: 'وسم مكتب الاستقبال',
    status: 'active',
    cardId: 'c1',
    cardSlug: 'sara-almamari',
    cardOwnerName: 'سارة المعمري',
    writeUrl: 'https://nomiqa.om/t/K7QM2P4A',
    scanCount: 168,
    lastScanAt: '2026-08-16T14:22:00.000Z',
    revokedAt: null,
    revokedReason: null,
    createdAt: '2026-06-11T07:00:00.000Z',
  },
  {
    id: 'tag2',
    code: 'B3XN9RTZ',
    label: 'بطاقة جيب — المعرض',
    status: 'unassigned',
    cardId: null,
    cardSlug: null,
    cardOwnerName: null,
    writeUrl: 'https://nomiqa.om/t/B3XN9RTZ',
    scanCount: 0,
    lastScanAt: null,
    revokedAt: null,
    revokedReason: null,
    createdAt: '2026-08-14T07:00:00.000Z',
  },
];

const campaigns: CampaignSummary[] = [
  {
    id: 'cp1',
    code: 'EXPO26',
    name: 'معرض عُمان اللوجستي 2026',
    cardId: 'c2',
    cardSlug: 'sara-events',
    utm: { source: 'expo', medium: 'print', campaign: 'oman-logistics-2026', term: null, content: null },
    startsAt: '2026-08-10T00:00:00.000Z',
    endsAt: '2026-08-13T23:59:00.000Z',
    isActive: true,
    isRunning: false,
    shareUrl: 'https://nomiqa.om/t/EXPO26',
    createdAt: '2026-07-28T07:00:00.000Z',
  },
];

const campaignReport: CampaignReport = {
  campaignId: 'cp1',
  name: 'معرض عُمان اللوجستي 2026',
  range: { from: '2026-08-10T00:00:00.000Z', to: '2026-08-16T23:59:00.000Z' },
  views: 174,
  uniqueVisitors: 123,
  formSubmits: 21,
  conversionRate: 17.1,
  series: [12, 38, 64, 31, 15, 9, 5].map((views, index) => ({
    date: new Date(Date.UTC(2026, 7, 10 + index)).toISOString(),
    views,
    uniqueVisitors: Math.round(views * 0.7),
  })),
  updatedAt: NOW,
};

const signature: SignaturePayload = {
  cardId: 'c1',
  cardSlug: 'sara-almamari',
  templateKey: 'classic',
  options: {
    showQr: true,
    showAvatar: true,
    showLogo: true,
    showSocialLinks: true,
    accentColor: '#2a3d6f',
    disclaimer: 'هذه الرسالة وما فيها من مرفقات موجّهة إلى المرسل إليه وحده.',
  },
  locale: 'ar',
  html: `<table style="font-family:Arial,sans-serif;font-size:13px;color:#161b2e"><tr><td style="padding-inline-end:14px;border-inline-end:2px solid #2a3d6f"><strong style="font-size:15px">سارة المعمري</strong><br/><span style="color:#5b6079">مديرة تطوير الأعمال</span><br/><span style="color:#5b6079">مجموعة الواحة</span></td><td style="padding-inline-start:14px"><a href="tel:+96891234567" style="color:#2a3d6f;text-decoration:none">+968 9123 4567</a><br/><a href="mailto:sara@alwaha.example" style="color:#2a3d6f;text-decoration:none">sara@alwaha.example</a><br/><a href="https://nomiqa.om/sara-almamari" style="color:#2a3d6f;text-decoration:none">nomiqa.om/sara-almamari</a></td></tr></table>`,
  text: 'سارة المعمري\nمديرة تطوير الأعمال — مجموعة الواحة\n+968 9123 4567\nsara@alwaha.example\nhttps://nomiqa.om/sara-almamari',
  enforced: false,
};

const events: EventSummary[] = [
  {
    id: 'ev1',
    name: 'معرض عُمان اللوجستي 2026',
    location: 'مركز عُمان للمؤتمرات، مسقط',
    startsAt: '2026-08-10T05:00:00.000Z',
    endsAt: '2026-08-13T14:00:00.000Z',
    status: 'ended',
    cardIds: ['c2'],
    qualifiers: [
      {
        key: 'budget',
        label: 'حجم الشحن السنوي',
        labelEn: 'Annual freight volume',
        type: 'select',
        options: ['أقل من 50 حاوية', '50–200 حاوية', 'أكثر من 200 حاوية'],
        required: true,
      },
      {
        key: 'decision',
        label: 'صاحب قرار الشراء',
        labelEn: 'Decision maker',
        type: 'boolean',
        options: [],
        required: false,
      },
    ],
    costBaisa: 4500000,
    targetLeads: 120,
    leadCount: 96,
    createdAt: '2026-07-28T07:00:00.000Z',
  },
  {
    id: 'ev2',
    name: 'ملتقى سلاسل الإمداد الخليجي',
    location: 'دبي',
    startsAt: '2026-09-02T05:00:00.000Z',
    endsAt: '2026-09-04T14:00:00.000Z',
    status: 'upcoming',
    cardIds: ['c2'],
    qualifiers: [],
    costBaisa: 2800000,
    targetLeads: 80,
    leadCount: 0,
    createdAt: '2026-08-15T07:00:00.000Z',
  },
];

const eventReport: EventReport = {
  eventId: 'ev1',
  name: 'معرض عُمان اللوجستي 2026',
  status: 'ended',
  startsAt: '2026-08-10T05:00:00.000Z',
  endsAt: '2026-08-13T14:00:00.000Z',
  leads: 96,
  qualifiedLeads: 61,
  duplicates: 7,
  scannedLeads: 44,
  qualificationRate: 63.5,
  costBaisa: 4500000,
  costPerLeadBaisa: 46875,
  targetLeads: 120,
  members: [
    { userId: 'usr_demo', fullName: 'سارة المعمري', leads: 51, qualifiedLeads: 36, duplicates: 3 },
    { userId: 'usr_3', fullName: 'ريم الشحية', leads: 45, qualifiedLeads: 25, duplicates: 4 },
  ],
  series: [21, 34, 27, 14].map((leads, index) => ({
    date: new Date(Date.UTC(2026, 7, 10 + index)).toISOString(),
    leads,
  })),
  qualifierBreakdown: {
    budget: { 'أقل من 50 حاوية': 28, '50–200 حاوية': 41, 'أكثر من 200 حاوية': 27 },
    decision: { 'نعم': 39, 'لا': 57 },
  },
};

const scans: ScanJobSummary[] = [
  {
    id: 'sc1',
    kind: 'business_card',
    status: 'review',
    eventId: 'ev1',
    extracted: {
      fullName: { value: 'طلال البوسعيدي', confidence: 0.96 },
      email: { value: 'talal@example.om', confidence: 0.91 },
      phone: { value: '+968 9987 4410', confidence: 0.88 },
      organizationName: { value: 'الخليج للنقل', confidence: 0.74 },
      jobTitle: { value: 'مدير أسطول', confidence: 0.52 },
    },
    confidence: 0.8,
    error: null,
    contactId: null,
    imageDeleted: false,
    createdAt: '2026-08-16T15:02:00.000Z',
    updatedAt: '2026-08-16T15:02:00.000Z',
  },
];

const apiKeys: ApiKeySummary[] = [
  {
    id: 'ak1',
    name: 'تكامل نظام المبيعات الداخلي',
    prefix: 'nmq_live_8f3a',
    scopes: ['contacts:read', 'cards:read'] as ApiKeySummary['scopes'],
    lastUsedAt: '2026-08-16T13:40:00.000Z',
    expiresAt: null,
    revokedAt: null,
    createdAt: '2026-05-04T07:00:00.000Z',
  },
];

const webhooks: WebhookEndpointSummary[] = [
  {
    id: 'wh1',
    url: 'https://ops.alwaha.example/hooks/nomiqa',
    description: 'إشعار فريق المبيعات بكل جهة اتصال جديدة',
    eventTypes: ['contact.captured', 'card.published'],
    isActive: true,
    disabledAt: null,
    disabledReason: null,
    consecutiveFailures: 0,
    lastSuccessAt: '2026-08-16T15:03:00.000Z',
    lastFailureAt: null,
    createdAt: '2026-06-20T07:00:00.000Z',
  },
];

const crm: CrmConnectionSummary[] = [
  {
    id: 'crm1',
    provider: 'hubspot',
    status: 'active',
    fieldMap: { fullName: 'firstname', email: 'email', phone: 'phone', organizationName: 'company' },
    ownerStrategy: 'capturer',
    ownerRef: null,
    marketingConsentOnly: true,
    lastSyncAt: '2026-08-16T15:10:00.000Z',
    lastError: null,
    pending: 2,
    failed: 0,
    createdAt: '2026-07-02T07:00:00.000Z',
  },
];

const profile: UserProfile = {
  id: 'usr_demo',
  email: 'sara@alwaha.example',
  emailVerified: true,
  fullName: 'سارة المعمري',
  locale: 'ar',
  timeZone: 'Asia/Muscat',
  createdAt: '2026-01-12T07:00:00.000Z',
};

const consents: ConsentStatus[] = [
  { purpose: 'terms', granted: true, documentVersion: '2026-01-01', currentVersion: true, updatedAt: '2026-01-12T07:02:00.000Z' },
  { purpose: 'privacy', granted: true, documentVersion: '2026-01-01', currentVersion: true, updatedAt: '2026-01-12T07:02:00.000Z' },
  { purpose: 'marketing', granted: false, documentVersion: null, currentVersion: false, updatedAt: null },
];

const cardEntitlements: CardEntitlements = { maxCards: 100, usedCards: 3, canCreate: true };
const wallet: WalletAvailability = { apple: true, google: true };
const scanAvailability: ScanAvailability = { entitled: true, ocrConfigured: true, provider: 'demo' };

const invoicesPage: Paginated<InvoiceSummary> = {
  data: invoices,
  meta: { page: 1, pageSize: 12, total: invoices.length, totalPages: 1 },
};

const directoryPage: Paginated<DirectoryEntry> = {
  data: directory,
  meta: { page: 1, pageSize: 24, total: directory.length, totalPages: 1 },
};

const changeRequestsPage: Paginated<ChangeRequestSummary> = {
  data: changeRequests,
  meta: { page: 1, pageSize: 20, total: changeRequests.length, totalPages: 1 },
};

const contactsPage: Paginated<ContactSummary> = {
  data: sampleContacts,
  meta: { page: 1, pageSize: 20, total: 214, totalPages: 11 },
};

/**
 * يطابق المسار بالبيانات.
 *
 * الترتيب مهم: أول تعبير يطابق يفوز، فالمسارات الأدق تسبق العامة.
 */
const routes: Array<[RegExp, unknown]> = [
  [/^\/me\/profile$/, profile],
  [/^\/me\/consents$/, consents],
  [/^\/me$/, me],

  [/^\/cards\/templates$/, templates],
  [/^\/cards\/entitlements$/, cardEntitlements],
  [/^\/cards\/[^/]+$/, cardDetail],
  [/^\/cards$/, sampleCards],

  [/^\/contacts\/stats$/, contactStats],
  [/^\/contacts\/[^/?]+$/, contactDetail],
  [/^\/contacts(\?.*)?$/, contactsPage],
  [/^\/tags$/, tags],
  [/^\/analytics\/overview/, sampleAnalytics],

  [/^\/teams\/departments$/, departments],
  [/^\/teams\/branches$/, branches],
  [/^\/teams\/members/, members],
  [/^\/teams\/imports$/, imports],
  [/^\/invitations$/, invitations],
  [/^\/directory/, directoryPage],

  [/^\/billing\/plans$/, plans],
  [/^\/billing\/entitlements$/, entitlements],
  [/^\/billing\/subscription$/, subscription],
  [/^\/billing\/invoices\/[^/]+$/, invoiceDetail],
  [/^\/billing\/invoices/, invoicesPage],

  [/^\/support\/tickets\/[^/]+$/, ticketDetail],
  [/^\/support\/tickets$/, tickets],

  [/^\/branding\/kit$/, brandKit],
  [/^\/branding\/policies$/, brandPolicies],
  [/^\/branding\/domains$/, domains],
  [/^\/change-requests\/mine$/, changeRequests],
  [/^\/change-requests/, changeRequestsPage],

  [/^\/nfc\/tags$/, nfcTags],
  [/^\/campaigns\/[^/]+\/report/, campaignReport],
  [/^\/campaigns$/, campaigns],
  [/^\/signatures\/templates$/, []],
  [/^\/signatures/, signature],
  [/^\/wallets\/availability$/, wallet],

  [/^\/events\/[^/]+\/report$/, eventReport],
  [/^\/events$/, events],
  [/^\/scans\/availability$/, scanAvailability],
  [/^\/scans$/, scans],

  [/^\/integrations\/api-keys$/, apiKeys],
  [/^\/integrations\/webhooks\/[^/]+\/deliveries/, []],
  [/^\/integrations\/webhooks$/, webhooks],
  [/^\/integrations\/crm\/[^/]+\/logs/, []],
  [/^\/integrations\/crm$/, crm],
];

/** هل وضع العرض مفعَّل؟ متغيّر بيئة صريح، لا استنتاج من بيئة التطوير. */
export function isDemoMode(): boolean {
  return process.env.NOMIQA_DEMO === '1';
}

/** بيانات المسار، أو `undefined` إن لم يُغطَّ — فيفشل النداء كالمعتاد. */
export function demoResponse(path: string): unknown {
  for (const [pattern, value] of routes) {
    if (pattern.test(path)) return value;
  }
  return undefined;
}

/** الجلسة المزيّفة التي يستعملها تخطيط الشاشات المُصادَقة في وضع العرض. */
export const demoSession = {
  user: { name: 'سارة المعمري', email: 'sara@alwaha.example' },
};

/** البطاقة العامة في وضع العرض — لتصوير ما يراه الزائر. */
export const demoPublicCard = {
  snapshot: sampleSnapshot,
  template: templates[0]!.definition,
};
