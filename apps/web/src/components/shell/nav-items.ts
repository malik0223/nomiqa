import type { IconName } from '@nomiqa/ui';

/**
 * خريطة التنقل.
 *
 * المجموعات ليست تصنيفاً جمالياً: كل مجموعة تجيب سؤالاً مختلفاً
 * يطرحه المستخدم — «كيف أدائي؟»، «ما الذي أعرضه؟»، «مع من
 * أتواصل؟»، «كيف تُدار مؤسستي؟». ترتيبها من الأكثر تكراراً في
 * الاستعمال اليومي إلى الأقل.
 *
 * القائمة كاملة للجميع، والصلاحية يفرضها الـAPI: إخفاء عنصر لا
 * يملك المستخدم صلاحيته يخفي وجود الميزة أصلاً، ويجعل شاشة الفريق
 * تبدو غير موجودة بدل أن تبدو ممنوعة.
 */

export interface NavItem {
  href: string;
  /** مفتاح الترجمة الكامل. */
  labelKey: string;
  icon: IconName;
}

export interface NavGroup {
  /** مفتاح اسم المجموعة تحت `nav.groups`. */
  key: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    key: 'measure',
    items: [{ href: '/dashboard', labelKey: 'dashboard.title', icon: 'dashboard' }],
  },
  {
    key: 'identity',
    items: [
      { href: '/cards', labelKey: 'cards.title', icon: 'card' },
      { href: '/signature', labelKey: 'signature.title', icon: 'signature' },
      { href: '/nfc', labelKey: 'nfc.title', icon: 'nfc' },
      { href: '/branding', labelKey: 'branding.title', icon: 'branding' },
    ],
  },
  {
    key: 'relations',
    items: [
      { href: '/contacts', labelKey: 'contacts.title', icon: 'contacts' },
      { href: '/campaigns', labelKey: 'campaigns.title', icon: 'campaigns' },
      { href: '/events', labelKey: 'events.title', icon: 'events' },
      { href: '/scan', labelKey: 'scan.title', icon: 'scan' },
      { href: '/directory', labelKey: 'directory.title', icon: 'directory' },
    ],
  },
  {
    key: 'organization',
    items: [
      { href: '/team', labelKey: 'team.title', icon: 'team' },
      { href: '/approvals', labelKey: 'approvals.title', icon: 'approvals' },
      { href: '/billing', labelKey: 'billing.title', icon: 'billing' },
      { href: '/integrations', labelKey: 'integrations.title', icon: 'integrations' },
    ],
  },
];

/** أسفل الشريط، مفصولة عن المجموعات: تُفتح نادراً ولا تخصّ عملاً يومياً. */
export const accountItems: NavItem[] = [
  { href: '/settings', labelKey: 'settings.title', icon: 'settings' },
  { href: '/support', labelKey: 'support.title', icon: 'support' },
];

/** يطابق المسار الحالي بعنصر التنقل، مع اعتبار المسارات الفرعية. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
