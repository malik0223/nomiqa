/**
 * أنواع الاشتراكات والفوترة (خارطة الطريق §9.4).
 *
 * كل المبالغ **بالبيسة** أعداداً صحيحة. لا رقم عشري يعبر هذه الحدود:
 * التحويل إلى ريال للعرض وحده، ويحدث في الواجهة عند الطباعة.
 */

export const BAISA_PER_OMR = 1000;

export type BillingInterval = 'month' | 'year';

export type SubscriptionStatus =
  | 'pending'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired';

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';

/**
 * مفاتيح الحدود العددية.
 *
 * القيمة ‎-1 = بلا حد. صفر يعني ممنوع تماماً — الفرق مقصود: الباقة
 * المجانية تسمح بصفر إدارات، لا ببلا حد.
 */
export interface PlanLimits {
  maxCards: number;
  maxMembers: number;
  maxDepartments: number;
  maxBranches: number;
  maxContacts: number;
}

/** مفاتيح الميزات غير العددية. */
export const PLAN_FEATURES = [
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
  // المرحلة 5 — الحضور المهني المتكامل (§10).
  //
  // خمس ميزات لا واحدة: مؤسسة تريد وسوم NFC لفريق الاستقبال قد لا
  // تحتاج حملات، ودمجها في «حزمة حضور» واحدة كان يجبرها على شراء ما
  // لا تستخدم.
  'nfc_tags',
  'wallet_passes',
  'email_signature',
  'meeting_backgrounds',
  'campaigns',
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number];

export interface PlanPriceSummary {
  id: string;
  interval: BillingInterval;
  currency: string;
  amountBaisa: number;
}

export interface PlanSummary {
  id: string;
  key: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  limits: PlanLimits;
  features: PlanFeature[];
  trialDays: number;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  prices: PlanPriceSummary[];
}

/**
 * ما تستحقه المؤسسة الآن.
 *
 * `usage` بجانب `limits` عمداً: واجهة تعرض «5 من 100 بطاقة» تحتاجهما
 * معاً، وحسابهما في استدعاءين يفتح نافذة يتغير فيها العدد بينهما.
 */
export interface OrganizationEntitlements {
  planKey: string;
  planName: string;
  status: SubscriptionStatus;
  limits: PlanLimits;
  features: PlanFeature[];
  usage: {
    cards: number;
    members: number;
    departments: number;
    branches: number;
    contacts: number;
  };
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** المؤسسة في مهلة سماح بعد فشل تحصيل — الخدمة تعمل والتحذير معروض. */
  inGracePeriod: boolean;
}

export interface SubscriptionSummary {
  id: string;
  planKey: string;
  planName: string;
  status: SubscriptionStatus;
  interval: BillingInterval | null;
  quantity: number;
  amountBaisa: number | null;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  gracePeriodEndsAt: string | null;
  couponCode: string | null;
}

export interface InvoiceLineSummary {
  id: string;
  description: string;
  descriptionEn: string | null;
  quantity: number;
  unitAmountBaisa: number;
  amountBaisa: number;
}

export interface InvoiceSummary {
  id: string;
  number: string;
  status: InvoiceStatus;
  currency: string;
  subtotalBaisa: number;
  discountBaisa: number;
  vatRateBps: number;
  vatBaisa: number;
  totalBaisa: number;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
}

export interface InvoiceDetail extends InvoiceSummary {
  lines: InvoiceLineSummary[];
  billingName: string | null;
  billingEmail: string | null;
  billingVatNumber: string | null;
  billingAddress: string | null;
  /** رابط الدفع إن كانت هناك محاولة معلّقة صالحة. */
  checkoutUrl: string | null;
}

/** نتيجة بدء اشتراك أو تجديده: إما رابط دفع أو تفعيل فوري. */
export interface CheckoutResult {
  /** paid = فُعِّل فوراً (تجربة أو مجانية أو خصم 100%). */
  outcome: 'redirect' | 'activated';
  checkoutUrl: string | null;
  invoiceId: string | null;
  paymentId: string | null;
}

/** معاينة تغيير الباقة قبل تأكيده. */
export interface PlanChangePreview {
  fromPlanKey: string;
  toPlanKey: string;
  direction: 'upgrade' | 'downgrade' | 'same';
  /** المستحق الآن بعد خصم ما تبقى من الفترة الحالية. */
  amountDueBaisa: number;
  vatBaisa: number;
  totalBaisa: number;
  currency: string;
  effectiveAt: string;
  /**
   * ما سيُفقد بالخفض — بطاقات فوق الحد، أعضاء فوق الحد، ميزات تُطفأ.
   * يُعرض قبل التأكيد لا بعده.
   */
  blockers: Array<{ code: string; current: number; allowed: number }>;
  lostFeatures: PlanFeature[];
}

export interface CouponSummary {
  code: string;
  name: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  durationCycles: number | null;
  /** المبلغ الذي سيُخصم من هذه الفاتورة بالضبط. */
  discountBaisa: number;
}

/** مهمة دورة الفوترة في الطابور. */
export interface BillingCycleJobData {
  /** renew = إنشاء فاتورة الفترة التالية، expire = إنهاء مهلة السماح. */
  action: 'renew' | 'expire';
  subscriptionId: string;
  organizationId: string;
}
