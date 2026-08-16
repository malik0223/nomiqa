import { describe, expect, it } from 'vitest';
import { changedFieldNames, lockedFieldsTouched, resolvePolicy, type PolicyRow } from './card-policy.js';

function policy(overrides: Partial<PolicyRow>): PolicyRow {
  return {
    id: 'p',
    departmentId: null,
    branchId: null,
    templateKey: null,
    lockedFields: [],
    requireApproval: false,
    enforcedValues: null,
    isActive: true,
    ...overrides,
  };
}

describe('resolvePolicy', () => {
  const organizationPolicy = policy({ id: 'org', lockedFields: ['organizationName'] });
  const departmentPolicy = policy({ id: 'dept', departmentId: 'd1', lockedFields: ['theme'] });
  const branchPolicy = policy({ id: 'branch', branchId: 'b1', lockedFields: ['logo'] });

  it('يعيد سياسة فارغة حين لا سياسة', () => {
    expect(resolvePolicy([], { departmentId: 'd1', branchId: 'b1' }).sourceScope).toBe('none');
  });

  it('يختار سياسة المؤسسة حين لا أخص منها', () => {
    const resolved = resolvePolicy([organizationPolicy], { departmentId: 'd1', branchId: 'b1' });
    expect(resolved.sourcePolicyId).toBe('org');
    expect(resolved.sourceScope).toBe('organization');
  });

  it('الإدارة تتقدم على الفرع وعلى المؤسسة', () => {
    const resolved = resolvePolicy([organizationPolicy, branchPolicy, departmentPolicy], {
      departmentId: 'd1',
      branchId: 'b1',
    });

    expect(resolved.sourcePolicyId).toBe('dept');
    // لا دمج: قفل المؤسسة على اسم المؤسسة لا ينتقل إلى سياسة الإدارة.
    expect(resolved.lockedFields).toEqual(['theme']);
  });

  it('الفرع يتقدم على المؤسسة حين لا سياسة إدارة', () => {
    const resolved = resolvePolicy([organizationPolicy, branchPolicy], {
      departmentId: 'd9',
      branchId: 'b1',
    });

    expect(resolved.sourcePolicyId).toBe('branch');
  });

  it('يتجاهل السياسات المعطّلة', () => {
    const resolved = resolvePolicy(
      [organizationPolicy, policy({ id: 'dept', departmentId: 'd1', isActive: false })],
      { departmentId: 'd1', branchId: null },
    );

    expect(resolved.sourcePolicyId).toBe('org');
  });
});

describe('lockedFieldsTouched', () => {
  it('يكتشف تعديل حقل مقفل داخل الترجمات', () => {
    const touched = lockedFieldsTouched(
      { localizations: [{ locale: 'ar', jobTitle: 'مدير' }] },
      ['jobTitle', 'organizationName'],
    );

    expect(touched).toEqual(['jobTitle']);
  });

  it('يكتشف التعديل ولو في لغة واحدة فقط', () => {
    const touched = lockedFieldsTouched(
      {
        localizations: [
          { locale: 'ar', fullName: 'سالم' },
          { locale: 'en', organizationName: 'Other Co' },
        ],
      },
      ['organizationName'],
    );

    expect(touched).toEqual(['organizationName']);
  });

  it('يعيد فارغاً حين لا يمس التعديل حقلاً مقفلاً', () => {
    expect(lockedFieldsTouched({ localizations: [{ locale: 'ar', bio: 'نبذة' }] }, ['theme'])).toEqual(
      [],
    );
  });

  it('يكتشف الحقول العليا مثل السمة والقالب', () => {
    expect(lockedFieldsTouched({ theme: { primaryColor: '#fff' } }, ['theme'])).toEqual(['theme']);
    expect(lockedFieldsTouched({ templateKey: 'modern' }, ['templateKey'])).toEqual(['templateKey']);
  });

  it('لا يعتبر القيمة undefined تعديلاً', () => {
    expect(lockedFieldsTouched({ theme: undefined }, ['theme'])).toEqual([]);
  });
});

describe('changedFieldNames', () => {
  it('يفكّ حقول الترجمات ويستبعد اللغة', () => {
    expect(
      changedFieldNames({
        localizations: [{ locale: 'ar', fullName: 'سالم', jobTitle: 'مدير' }],
        theme: { primaryColor: '#000' },
      }),
    ).toEqual(['fullName', 'jobTitle', 'theme']);
  });

  it('يتجاهل الحقول غير المرسلة', () => {
    expect(changedFieldNames({ theme: undefined, templateKey: 'classic' })).toEqual(['templateKey']);
  });
});
