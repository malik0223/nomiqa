import { ForbiddenException } from '@nestjs/common';
import type { TenantContext } from '@nomiqa/contracts';

/**
 * تحقق نطاق التفويض (§9.2).
 *
 * الحارس يقرر «هل يجوز له طرق هذا الباب؟»، وهذه الدوال تقرر «هل يجوز
 * له لمس هذا الصف؟». الفصل ضروري لأن الحارس لا يملك الصف: معرفة أن
 * الموظف المستهدف في إدارة المبيعات تتطلب قراءته من قاعدة البيانات،
 * وهذا عمل الخدمة.
 *
 * القاعدة الحاكمة: **من يملك الصلاحية على المؤسسة يملكها على كل نطاق**،
 * والعكس ليس صحيحاً.
 */

/** موقع الصف المستهدف في الهيكل. */
export interface ScopeTarget {
  departmentId: string | null;
  branchId: string | null;
}

/** هل الصلاحية ممنوحة على المؤسسة كلها؟ */
export function hasOrgPermission(tenant: TenantContext, permission: string): boolean {
  return tenant.permissions.includes(permission);
}

/** الوحدات التي مُنحت عليها الصلاحية، مفصولة بالمحور. */
export function grantedScopes(
  tenant: TenantContext,
  permission: string,
): { departmentIds: string[]; branchIds: string[] } {
  const departmentIds: string[] = [];
  const branchIds: string[] = [];

  for (const grant of tenant.scopedPermissions) {
    if (grant.permission !== permission) {
      continue;
    }
    if (grant.scopeType === 'department') {
      departmentIds.push(grant.scopeId);
    } else {
      branchIds.push(grant.scopeId);
    }
  }

  return { departmentIds, branchIds };
}

/**
 * هل يغطي تفويض المستخدم الصف المستهدف؟
 *
 * صف بلا إدارة ولا فرع **لا يغطيه أي تفويض محدود**: موظف غير مسنَد إلى
 * وحدة لا يقع تحت أي مسؤول وحدة، وافتراض العكس كان سيجعل إنشاء إدارة
 * واحدة يمنح مسؤولها كل الموظفين غير المصنَّفين.
 */
export function scopeCovers(
  tenant: TenantContext,
  permission: string,
  target: ScopeTarget,
): boolean {
  if (hasOrgPermission(tenant, permission)) {
    return true;
  }

  const { departmentIds, branchIds } = grantedScopes(tenant, permission);

  if (target.departmentId && departmentIds.includes(target.departmentId)) {
    return true;
  }
  if (target.branchId && branchIds.includes(target.branchId)) {
    return true;
  }

  return false;
}

/** يرمي 403 حين لا يغطي التفويض الهدف. */
export function assertScopeCovers(
  tenant: TenantContext,
  permission: string,
  target: ScopeTarget,
): void {
  if (!scopeCovers(tenant, permission, target)) {
    // نفس رسالة نقص الصلاحية: التمييز بين «لا صلاحية» و«خارج نطاقك»
    // يكشف لمسؤول إدارة وجود موظف في إدارة أخرى بمعرّف معيّن.
    throw new ForbiddenException('لا تملك الصلاحية اللازمة لهذه العملية');
  }
}

/** شرط Prisma على صف يحمل موقعاً في الهيكل. */
export interface ScopeWhere {
  OR: Array<{ departmentId?: { in: string[] }; branchId?: { in: string[] } }>;
}

/**
 * شرط Prisma يقصر النتائج على ما يغطيه التفويض.
 *
 * يُرجع `undefined` لصاحب الصلاحية على المؤسسة — لا شرط إضافي. ولمن
 * دونه يُرجع **دائماً** شرطاً بصيغة `OR` واحدة موحّدة.
 *
 * توحيد الشكل مقصود: النتيجة تُركَّب في مصفوفة `AND` عند المستدعي، لا
 * تُنثر في كائن الشرط. النثر كان يعني أن أي شرط آخر يحمل `OR` —
 * كالبحث بالاسم — **يدهس شرط النطاق فيختفي القيد بصمت**، فيرى مسؤول
 * إدارة كل موظفي المؤسسة بمجرد أن يكتب حرفاً في مربع البحث.
 *
 * حين لا يوجد أي تفويض يُرجع شرطاً مستحيلاً بدل قائمة كاملة: خطأ في
 * الاستدعاء يجب أن يُخفي لا أن يكشف.
 */
export function scopeFilter(
  tenant: TenantContext,
  permission: string,
): ScopeWhere | undefined {
  if (hasOrgPermission(tenant, permission)) {
    return undefined;
  }

  const { departmentIds, branchIds } = grantedScopes(tenant, permission);

  if (departmentIds.length === 0 && branchIds.length === 0) {
    return { OR: [{ departmentId: { in: [] } }] };
  }

  const conditions: ScopeWhere['OR'] = [];
  if (departmentIds.length > 0) {
    conditions.push({ departmentId: { in: departmentIds } });
  }
  if (branchIds.length > 0) {
    conditions.push({ branchId: { in: branchIds } });
  }

  return { OR: conditions };
}

/**
 * يجمع شرط النطاق مع شروط أخرى في `AND` آمنة.
 *
 * الطريق الوحيد المسموح لاستخدام `scopeFilter` في استعلام: يمنع
 * بالبناء أن يدهس شرطٌ آخر قيدَ النطاق.
 */
export function withScope(
  scope: ScopeWhere | undefined,
  ...conditions: Array<object | undefined>
): { AND: object[] } | Record<string, never> {
  const all = [scope, ...conditions].filter(
    (condition): condition is object => condition !== undefined,
  );

  return all.length > 0 ? { AND: all } : ({} as Record<string, never>);
}
