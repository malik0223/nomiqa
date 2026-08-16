import { ForbiddenException } from '@nestjs/common';
import type { TenantContext } from '@nomiqa/contracts';
import { describe, expect, it } from 'vitest';
import {
  assertScopeCovers,
  grantedScopes,
  hasOrgPermission,
  scopeCovers,
  scopeFilter,
  withScope,
} from './scope.js';

function tenant(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    organizationId: 'org-1',
    membershipId: 'mem-1',
    roles: [],
    permissions: [],
    scopedPermissions: [],
    suspended: false,
    ...overrides,
  };
}

const MANAGE = 'members:manage';

describe('hasOrgPermission', () => {
  it('يميّز الصلاحية على المؤسسة عن التفويض المحدود', () => {
    const scopedOnly = tenant({
      scopedPermissions: [{ permission: MANAGE, scopeType: 'department', scopeId: 'd1' }],
    });

    // التفويض المحدود لا يجعل الصلاحية شاملة — هذا لبّ الفصل بين
    // الحقلين، وانهياره يوسّع كل مسار قائم يقرأ `permissions`.
    expect(hasOrgPermission(scopedOnly, MANAGE)).toBe(false);
    expect(hasOrgPermission(tenant({ permissions: [MANAGE] }), MANAGE)).toBe(true);
  });
});

describe('scopeCovers', () => {
  const scoped = tenant({
    scopedPermissions: [
      { permission: MANAGE, scopeType: 'department', scopeId: 'd1' },
      { permission: 'cards:approve', scopeType: 'branch', scopeId: 'b9' },
    ],
  });

  it('يغطي صاحب صلاحية المؤسسة كل صف', () => {
    const owner = tenant({ permissions: [MANAGE] });
    expect(scopeCovers(owner, MANAGE, { departmentId: null, branchId: null })).toBe(true);
    expect(scopeCovers(owner, MANAGE, { departmentId: 'any', branchId: 'any' })).toBe(true);
  });

  it('يغطي المفوَّض صفوف وحدته وحدها', () => {
    expect(scopeCovers(scoped, MANAGE, { departmentId: 'd1', branchId: null })).toBe(true);
    expect(scopeCovers(scoped, MANAGE, { departmentId: 'd2', branchId: null })).toBe(false);
  });

  it('لا يخلط بين الصلاحيات: نطاق على صلاحية لا يغطي صلاحية أخرى', () => {
    expect(scopeCovers(scoped, MANAGE, { departmentId: null, branchId: 'b9' })).toBe(false);
    expect(scopeCovers(scoped, 'cards:approve', { departmentId: null, branchId: 'b9' })).toBe(true);
  });

  /**
   * موظف بلا وحدة لا يقع تحت أي مسؤول وحدة. العكس كان سيجعل إنشاء
   * إدارة واحدة يمنح مسؤولها كل غير المصنَّفين.
   */
  it('لا يغطي التفويض المحدود صفاً بلا وحدة', () => {
    expect(scopeCovers(scoped, MANAGE, { departmentId: null, branchId: null })).toBe(false);
  });

  it('يرمي 403 حين لا يغطي الهدف', () => {
    expect(() =>
      assertScopeCovers(scoped, MANAGE, { departmentId: 'd2', branchId: null }),
    ).toThrow(ForbiddenException);
  });
});

describe('grantedScopes', () => {
  it('يفصل الإدارات عن الفروع للصلاحية المطلوبة وحدها', () => {
    const actor = tenant({
      scopedPermissions: [
        { permission: MANAGE, scopeType: 'department', scopeId: 'd1' },
        { permission: MANAGE, scopeType: 'branch', scopeId: 'b1' },
        { permission: 'cards:approve', scopeType: 'department', scopeId: 'd9' },
      ],
    });

    expect(grantedScopes(actor, MANAGE)).toEqual({
      departmentIds: ['d1'],
      branchIds: ['b1'],
    });
  });
});

describe('scopeFilter', () => {
  it('لا يضيف شرطاً لصاحب صلاحية المؤسسة', () => {
    expect(scopeFilter(tenant({ permissions: [MANAGE] }), MANAGE)).toBeUndefined();
  });

  /** بلا تفويض إطلاقاً: شرط مستحيل لا قائمة كاملة. */
  it('يُخفي كل شيء عمّن لا تفويض له', () => {
    expect(scopeFilter(tenant(), MANAGE)).toEqual({ OR: [{ departmentId: { in: [] } }] });
  });

  it('يبني OR موحّدة على الوحدات الممنوحة', () => {
    const actor = tenant({
      scopedPermissions: [
        { permission: MANAGE, scopeType: 'department', scopeId: 'd1' },
        { permission: MANAGE, scopeType: 'branch', scopeId: 'b1' },
      ],
    });

    expect(scopeFilter(actor, MANAGE)).toEqual({
      OR: [{ departmentId: { in: ['d1'] } }, { branchId: { in: ['b1'] } }],
    });
  });

  /**
   * الشكل موحّد دائماً — حتى بوحدة واحدة.
   *
   * إرجاع كائن مسطّح في الحالة المفردة كان يغري بنثره في شرط
   * الاستعلام، وهو بالضبط ما يفتح ثغرة الدهس.
   */
  it('يُبقي الصيغة OR ولو كانت وحدة واحدة', () => {
    const actor = tenant({
      scopedPermissions: [{ permission: MANAGE, scopeType: 'department', scopeId: 'd1' }],
    });

    expect(scopeFilter(actor, MANAGE)).toEqual({ OR: [{ departmentId: { in: ['d1'] } }] });
  });
});

describe('withScope', () => {
  const scope = { OR: [{ departmentId: { in: ['d1'] } }] };
  const search = { OR: [{ employeeNo: { contains: 'x' } }] };

  /**
   * الانحدار الذي يحرسه هذا الملف.
   *
   * نثر الشرطين في كائن واحد يجعل بحثاً بالاسم **يدهس قيد النطاق**،
   * فيرى مسؤول إدارة كل موظفي المؤسسة بمجرد كتابة حرف في مربع البحث.
   * التركيب في `AND` يحفظ الشرطين معاً.
   */
  it('يحفظ شرط النطاق حين يوجد شرط OR آخر', () => {
    const composed = withScope(scope, search);

    expect(composed).toEqual({ AND: [scope, search] });

    // التوثيق الصريح للخطأ الذي نتجنّبه:
    const naive = { ...scope, ...search };
    expect(naive.OR).toEqual(search.OR);
    expect(naive.OR).not.toEqual(scope.OR);
  });

  it('يتخطى الشروط الغائبة', () => {
    expect(withScope(scope, undefined)).toEqual({ AND: [scope] });
    expect(withScope(undefined, search)).toEqual({ AND: [search] });
  });

  it('يعيد كائناً فارغاً حين لا شرط إطلاقاً', () => {
    expect(withScope(undefined)).toEqual({});
  });
});
