/**
 * حصص الباقات.
 *
 * خارطة الطريق §7.1: بطاقة واحدة في الباقة المجانية. الحد يُقرأ من
 * هنا لا يُكتب في شرط متناثر داخل الخدمة، حتى يكون تفعيل الباقات في
 * المرحلة 4 تغييراً في مصدر الباقة وحده.
 *
 * لا جدول اشتراكات بعد — كل مؤسسة على الباقة المجانية. `resolvePlan`
 * هي النقطة الوحيدة التي ستقرأ الاشتراك لاحقاً.
 */

export const PLAN_LIMITS = {
  free: { maxCards: 1 },
  pro: { maxCards: 5 },
  business: { maxCards: 25 },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;

export interface OrganizationPlanSource {
  kind: string;
}

/**
 * الباقة الحالية للمؤسسة.
 *
 * تُرجع `free` دائماً في MVP عمداً — بما فيها مؤسسات `business`.
 * نوع المؤسسة ليس باقة: مؤسسة حقيقية بلا اشتراك تبقى على الحد
 * المجاني، وإلا صار تغيير حقل `kind` تجاوزاً مجانياً للحصة.
 */
export function resolvePlan(_organization: OrganizationPlanSource): PlanKey {
  return 'free';
}

export function maxCardsFor(organization: OrganizationPlanSource): number {
  return PLAN_LIMITS[resolvePlan(organization)].maxCards;
}
