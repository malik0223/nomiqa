import type { EffectiveCardPolicy, LockableField } from '@nomiqa/contracts';

/**
 * حلّ سياسة البطاقة وفرض الحقول المقفلة (خارطة الطريق §9.3).
 *
 * دوال نقية بلا قاعدة بيانات: قرار «هل يجوز لهذا الموظف تعديل هذا
 * الحقل؟» يُتخذ في مسارين — تعديل البطاقة وإنشاء طلب موافقة — وأي
 * اختلاف بينهما ثغرة صامتة. وضعه هنا يجعله تعريفاً واحداً مختبَراً.
 */

export interface PolicyRow {
  id: string;
  departmentId: string | null;
  branchId: string | null;
  templateKey: string | null;
  lockedFields: string[];
  requireApproval: boolean;
  enforcedValues: unknown;
  isActive: boolean;
}

export interface MemberPlacement {
  departmentId: string | null;
  branchId: string | null;
}

const NO_POLICY: EffectiveCardPolicy = {
  sourcePolicyId: null,
  sourceScope: 'none',
  templateKey: null,
  lockedFields: [],
  requireApproval: false,
  enforcedValues: null,
};

/**
 * يختار السياسة السارية.
 *
 * الأخص يفوز: الإدارة، ثم الفرع، ثم المؤسسة. لا دمج بين المستويات —
 * سياسة الإدارة تحلّ محل سياسة المؤسسة ولا تُضاف إليها. الدمج كان
 * سيجعل من المستحيل على إدارة أن **ترخي** قيداً عاماً، وهو طلب واقعي
 * (فريق التسويق يحتاج حرية في الألوان لا يحتاجها المحاسبون).
 *
 * الترتيب بين الإدارة والفرع محسوم لصالح الإدارة: الوظيفة تحدد ما
 * يظهر على البطاقة أكثر مما يحدده الموقع الجغرافي.
 */
export function resolvePolicy(
  policies: PolicyRow[],
  placement: MemberPlacement,
): EffectiveCardPolicy {
  const active = policies.filter((policy) => policy.isActive);

  const byDepartment = placement.departmentId
    ? active.find((policy) => policy.departmentId === placement.departmentId)
    : undefined;

  const byBranch = placement.branchId
    ? active.find((policy) => policy.branchId === placement.branchId)
    : undefined;

  const organizationWide = active.find(
    (policy) => policy.departmentId === null && policy.branchId === null,
  );

  const chosen = byDepartment ?? byBranch ?? organizationWide;

  if (!chosen) {
    return NO_POLICY;
  }

  return {
    sourcePolicyId: chosen.id,
    sourceScope:
      chosen === byDepartment ? 'department' : chosen === byBranch ? 'branch' : 'organization',
    templateKey: chosen.templateKey,
    lockedFields: chosen.lockedFields as LockableField[],
    requireApproval: chosen.requireApproval,
    enforcedValues: (chosen.enforcedValues as Record<string, unknown> | null) ?? null,
  };
}

/**
 * الحقول المقفلة التي يمسّها تعديل مقترح.
 *
 * الخريطة صريحة لا استنتاجية: مدخلات تعديل البطاقة مسطّحة بأسماء
 * تقنية (`localizations`, `theme`, `links`)، ومفاتيح القفل بلغة
 * المسؤول (`jobTitle`, `logo`). ربطها بالتخمين — بمطابقة الأسماء —
 * كان سيترك حقلاً جديداً بلا حماية في أول مرة يُضاف فيها.
 */
const LOCK_TO_INPUT_PATHS: Record<LockableField, string[]> = {
  organizationName: ['localizations.organizationName'],
  jobTitle: ['localizations.jobTitle'],
  department: ['localizations.department'],
  fullName: ['localizations.fullName'],
  bio: ['localizations.bio'],
  addressLine: ['localizations.addressLine'],
  theme: ['theme'],
  templateKey: ['templateKey'],
  logo: ['logoFileId'],
  cover: ['coverFileId'],
  avatar: ['avatarFileId'],
  links: ['links'],
  contactForm: ['contactForm'],
};

/**
 * يقارن التعديل المقترح بالحقول المقفلة.
 *
 * يُرجع أسماء الحقول المقفلة التي حاول التعديل لمسها، فارغةً إن كان
 * التعديل مسموحاً كله.
 */
export function lockedFieldsTouched(
  input: Record<string, unknown>,
  lockedFields: LockableField[],
): LockableField[] {
  const touched: LockableField[] = [];

  for (const field of lockedFields) {
    const paths = LOCK_TO_INPUT_PATHS[field] ?? [];

    for (const path of paths) {
      if (pathPresent(input, path)) {
        touched.push(field);
        break;
      }
    }
  }

  return touched;
}

/**
 * هل المسار موجود في المدخلات؟
 *
 * `localizations` مصفوفة لغات، فالمسار `localizations.jobTitle` يعني
 * «أي لغة تحمل هذا الحقل». تعديل المسمى الوظيفي بالإنجليزية وحدها
 * تعديلٌ له، ومعاملته على أنه ليس كذلك ثغرة.
 */
function pathPresent(input: Record<string, unknown>, path: string): boolean {
  const [head, tail] = path.split('.');

  if (!head || !(head in input) || input[head] === undefined) {
    return false;
  }

  if (!tail) {
    return true;
  }

  const value = input[head];

  if (Array.isArray(value)) {
    return value.some(
      (entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        (entry as Record<string, unknown>)[tail] !== undefined,
    );
  }

  if (value !== null && typeof value === 'object') {
    return (value as Record<string, unknown>)[tail] !== undefined;
  }

  return false;
}

/** أسماء الحقول المعدَّلة في طلب — لعرضها للمراجع دون كشف القيم. */
export function changedFieldNames(payload: Record<string, unknown>): string[] {
  const names: string[] = [];

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }

    if (key === 'localizations' && Array.isArray(value)) {
      const inner = new Set<string>();
      for (const entry of value) {
        if (entry && typeof entry === 'object') {
          for (const [field, fieldValue] of Object.entries(entry as Record<string, unknown>)) {
            if (fieldValue !== undefined && field !== 'locale') {
              inner.add(field);
            }
          }
        }
      }
      names.push(...[...inner].sort());
      continue;
    }

    names.push(key);
  }

  return [...new Set(names)].sort();
}
