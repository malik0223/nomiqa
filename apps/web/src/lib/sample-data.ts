import type {
  AnalyticsOverview,
  CardSnapshot,
  CardSummary,
  ContactSummary,
  TemplateDefinition,
} from '@nomiqa/contracts';

/**
 * بيانات نموذجية للعرض.
 *
 * تُستعمل في موضعين اثنين لا ثالث لهما: بطل الصفحة التعريفية،
 * وشاشات دليل الاستخدام. **لا تُستعمل في أي مسار مُصادَق** — الشاشات
 * الحقيقية تقرأ من الـAPI وحده، وإسقاط بيانات نموذجية عند فشل النداء
 * يخفي العطل بدل أن يعلنه.
 *
 * الأسماء والأرقام هنا مُختلَقة بالكامل ولا تخصّ أحداً.
 */

export const sampleTemplate: TemplateDefinition = {
  layout: 'centered',
  sections: ['identity', 'actions', 'links'],
  supportsCover: false,
  theme: { primaryColor: '#2a3d6f', borderRadius: 'medium', colorScheme: 'light' },
};

export const sampleSnapshot: CardSnapshot = {
  slug: 'sara-almamari',
  templateKey: 'classic',
  templateVersion: 1,
  defaultLocale: 'ar',
  theme: { primaryColor: '#2a3d6f', borderRadius: 'medium', colorScheme: 'light' },
  sectionOrder: ['identity', 'actions', 'links'],
  content: {
    ar: {
      locale: 'ar',
      fullName: 'سارة المعمري',
      jobTitle: 'مديرة تطوير الأعمال',
      organizationName: 'مجموعة الواحة',
      department: 'قطاع الخدمات اللوجستية',
      bio: 'أعمل على شراكات سلاسل الإمداد في عُمان والخليج. أسعد بالتعارف في المعارض المهنية.',
      addressLine: 'مسقط، سلطنة عُمان',
    },
    en: {
      locale: 'en',
      fullName: 'Sara Al Mamari',
      jobTitle: 'Business Development Manager',
      organizationName: 'Al Waha Group',
      department: 'Logistics',
      bio: 'I work on supply-chain partnerships across Oman and the Gulf.',
      addressLine: 'Muscat, Oman',
    },
  },
  links: [
    {
      id: 'l1',
      type: 'phone',
      platform: null,
      label: 'اتصال مباشر',
      labelEn: 'Call',
      value: '+968 9123 4567',
      position: 0,
      isVisible: true,
      isPrimary: true,
    },
    {
      id: 'l2',
      type: 'whatsapp',
      platform: null,
      label: 'واتساب',
      labelEn: 'WhatsApp',
      value: '+968 9123 4567',
      position: 1,
      isVisible: true,
      isPrimary: true,
    },
    {
      id: 'l3',
      type: 'email',
      platform: null,
      label: 'البريد',
      labelEn: 'Email',
      value: 'sara@alwaha.example',
      position: 2,
      isVisible: true,
      isPrimary: false,
    },
    {
      id: 'l4',
      type: 'social',
      platform: 'linkedin',
      label: 'لينكدإن',
      labelEn: 'LinkedIn',
      value: 'https://linkedin.com/in/example',
      position: 3,
      isVisible: true,
      isPrimary: false,
    },
    {
      id: 'l5',
      type: 'booking',
      platform: null,
      label: 'احجز اجتماعاً',
      labelEn: 'Book a meeting',
      value: 'https://cal.example/sara',
      position: 4,
      isVisible: true,
      isPrimary: false,
    },
  ],
  media: { avatarUrl: null, coverUrl: null, logoUrl: null },
};

/** سلسلة ثلاثين يوماً بشكل واقعي: ذروة أسبوع المعرض ثم هبوط. */
function buildSeries(): AnalyticsOverview['series'] {
  const shape = [
    12, 18, 9, 14, 22, 7, 5, 19, 26, 31, 24, 17, 11, 8, 15, 21, 38, 64, 91, 77, 42, 28, 19, 23, 30,
    26, 18, 14, 20, 25,
  ];

  // تاريخ ثابت لا `Date.now()`: هذه البيانات تُلتقط في لقطات الدليل،
  // وسلسلة تتغيّر كل يوم تجعل كل لقطة تختلف عن التي قبلها بلا سبب.
  const end = Date.UTC(2026, 7, 16);

  return shape.map((views, index) => {
    const date = new Date(end - (shape.length - 1 - index) * 86_400_000);
    return {
      date: date.toISOString(),
      views,
      uniqueVisitors: Math.round(views * 0.72),
      linkClicks: Math.round(views * 0.41),
      formSubmits: Math.round(views * 0.09),
    };
  });
}

export const sampleAnalytics: AnalyticsOverview = {
  range: { from: '2026-07-18T00:00:00.000Z', to: '2026-08-16T23:59:59.000Z' },
  summary: {
    views: 786,
    uniqueVisitors: 564,
    linkClicks: 322,
    vcardDownloads: 138,
    qrScans: 201,
    formViews: 176,
    formSubmits: 71,
    conversionRate: 12.6,
  },
  series: buildSeries(),
  topLinks: [
    { linkId: 'l2', type: 'whatsapp', platform: null, label: 'واتساب', value: '', clicks: 118 },
    { linkId: 'l1', type: 'phone', platform: null, label: 'اتصال مباشر', value: '', clicks: 96 },
    {
      linkId: 'l4',
      type: 'social',
      platform: 'linkedin',
      label: 'لينكدإن',
      value: '',
      clicks: 61,
    },
    { linkId: 'l5', type: 'booking', platform: null, label: 'احجز اجتماعاً', value: '', clicks: 47 },
  ],
  cards: [
    {
      cardId: 'c1',
      slug: 'sara-almamari',
      fullName: 'سارة المعمري',
      views: 612,
      uniqueVisitors: 441,
      formSubmits: 58,
    },
    {
      cardId: 'c2',
      slug: 'sara-events',
      fullName: 'سارة المعمري — معرض عُمان اللوجستي',
      views: 174,
      uniqueVisitors: 123,
      formSubmits: 13,
    },
  ],
  sources: [
    { source: 'qr', views: 241 },
    { source: 'nfc', views: 168 },
    { source: 'signature', views: 97 },
    { source: 'campaign', views: 74 },
    { source: 'wallet', views: 39 },
  ],
  updatedAt: '2026-08-16T18:40:00.000Z',
};

export const sampleCards: CardSummary[] = [
  {
    id: 'c1',
    slug: 'sara-almamari',
    status: 'published',
    fullName: 'سارة المعمري',
    templateKey: 'classic',
    publishedAt: '2026-06-02T09:15:00.000Z',
    updatedAt: '2026-08-14T11:20:00.000Z',
    hasUnpublishedChanges: false,
  },
  {
    id: 'c2',
    slug: 'sara-events',
    status: 'published',
    fullName: 'سارة المعمري — نسخة المعارض',
    templateKey: 'cover',
    publishedAt: '2026-07-28T07:00:00.000Z',
    updatedAt: '2026-08-16T06:45:00.000Z',
    hasUnpublishedChanges: true,
  },
  {
    id: 'c3',
    slug: 'sara-en',
    status: 'draft',
    fullName: 'Sara Al Mamari',
    templateKey: 'minimal',
    publishedAt: null,
    updatedAt: '2026-08-15T19:05:00.000Z',
  hasUnpublishedChanges: true,
  },
];

export const sampleContacts: ContactSummary[] = [
  {
    id: 'k1',
    fullName: 'خالد البلوشي',
    email: 'khalid@example.om',
    phone: '+968 9911 2233',
    organizationName: 'موانئ صحار',
    jobTitle: 'مدير المشتريات',
    source: 'card_form',
    followUpStatus: 'new',
    followUpAt: '2026-08-19T08:00:00.000Z',
    cardId: 'c1',
    cardSlug: 'sara-almamari',
    tags: [{ id: 't1', name: 'معرض عُمان اللوجستي', color: '#c8a24a' }],
    isDuplicate: false,
    noteCount: 0,
    capturedAt: '2026-08-16T10:12:00.000Z',
  },
  {
    id: 'k2',
    fullName: 'منى الحارثية',
    email: 'mona@example.com',
    phone: null,
    organizationName: 'الشركة العُمانية للتخليص',
    jobTitle: 'رئيسة العمليات',
    source: 'scan',
    followUpStatus: 'in_progress',
    followUpAt: null,
    cardId: 'c2',
    cardSlug: 'sara-events',
    tags: [
      { id: 't1', name: 'معرض عُمان اللوجستي', color: '#c8a24a' },
      { id: 't2', name: 'أولوية عالية', color: '#b3352f' },
    ],
    isDuplicate: false,
    noteCount: 0,
    capturedAt: '2026-08-15T14:38:00.000Z',
  },
  {
    id: 'k3',
    fullName: 'أحمد الكندي',
    email: 'ahmed.k@example.net',
    phone: '+971 50 445 8890',
    organizationName: 'خليج الإمداد',
    jobTitle: 'شريك تجاري',
    source: 'card_form',
    followUpStatus: 'done',
    followUpAt: null,
    cardId: 'c1',
    cardSlug: 'sara-almamari',
    tags: [],
    isDuplicate: false,
    noteCount: 0,
    capturedAt: '2026-08-13T09:02:00.000Z',
  },
  {
    id: 'k4',
    fullName: 'ليلى الزدجالية',
    email: 'laila@example.org',
    phone: '+968 9445 1120',
    organizationName: 'غرفة تجارة مسقط',
    jobTitle: 'أخصائية علاقات',
    source: 'badge',
    followUpStatus: 'new',
    followUpAt: null,
    cardId: 'c2',
    cardSlug: 'sara-events',
    tags: [{ id: 't3', name: 'جهة حكومية', color: '#2f7d5b' }],
    isDuplicate: true,
    noteCount: 0,
    capturedAt: '2026-08-12T16:24:00.000Z',
  },
];
