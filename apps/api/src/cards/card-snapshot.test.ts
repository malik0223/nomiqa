import { describe, expect, it } from 'vitest';
import {
  buildSnapshot,
  parseSectionOrder,
  parseTheme,
  publishBlockers,
  type SnapshotSource,
} from './card-snapshot.js';

function source(overrides: Partial<SnapshotSource> = {}): SnapshotSource {
  return {
    slug: 'salim',
    templateKey: 'classic',
    templateVersion: 1,
    defaultLocale: 'ar',
    theme: { primaryColor: '#0F766E' },
    sectionOrder: ['identity', 'actions'],
    localizations: [
      {
        locale: 'ar',
        fullName: 'سالم الهنائي',
        jobTitle: 'مدير المنتج',
        organizationName: null,
        department: null,
        bio: null,
        addressLine: null,
      },
    ],
    links: [
      {
        id: 'link-1',
        type: 'phone',
        platform: null,
        label: null,
        labelEn: null,
        value: '+96891234567',
        position: 1,
        isVisible: true,
        isPrimary: true,
      },
    ],
    media: {},
    ...overrides,
  };
}

describe('buildSnapshot', () => {
  it('يفهرس المحتوى باللغة', () => {
    const snapshot = buildSnapshot(source());

    expect(snapshot.content.ar?.fullName).toBe('سالم الهنائي');
    expect(snapshot.content.en).toBeUndefined();
  });

  it('يستبعد الروابط المخفية من اللقطة كلياً', () => {
    const snapshot = buildSnapshot(
      source({
        links: [
          {
            id: 'visible',
            type: 'phone',
            platform: null,
            label: null,
            labelEn: null,
            value: '+96891234567',
            position: 0,
            isVisible: true,
            isPrimary: false,
          },
          {
            id: 'hidden',
            type: 'email',
            platform: null,
            label: null,
            labelEn: null,
            // إخفاء الرابط قرار خصوصية: يجب ألا يصل مصدر الصفحة العامة.
            value: 'private@example.com',
            position: 1,
            isVisible: false,
            isPrimary: false,
          },
        ],
      }),
    );

    expect(snapshot.links).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toContain('private@example.com');
  });

  it('يرتب الروابط بالموضع لا بترتيب الإدراج', () => {
    const snapshot = buildSnapshot(
      source({
        links: [
          {
            id: 'second',
            type: 'website',
            platform: null,
            label: null,
            labelEn: null,
            value: 'https://example.com',
            position: 5,
            isVisible: true,
            isPrimary: false,
          },
          {
            id: 'first',
            type: 'phone',
            platform: null,
            label: null,
            labelEn: null,
            value: '+96891234567',
            position: 1,
            isVisible: true,
            isPrimary: false,
          },
        ],
      }),
    );

    expect(snapshot.links.map((link) => link.id)).toEqual(['first', 'second']);
  });

  it('يحوّل الوسائط الغائبة إلى null صريح', () => {
    const snapshot = buildSnapshot(source());

    expect(snapshot.media).toEqual({ avatarUrl: null, coverUrl: null, logoUrl: null });
  });
});

describe('publishBlockers', () => {
  it('يقبل بطاقة مكتملة', () => {
    expect(publishBlockers(buildSnapshot(source()))).toEqual([]);
  });

  it('يمنع النشر بلا محتوى في اللغة الافتراضية', () => {
    const snapshot = buildSnapshot(source({ defaultLocale: 'en' }));

    expect(publishBlockers(snapshot)).toHaveLength(1);
  });

  it('يمنع النشر بلا وسيلة تواصل ظاهرة', () => {
    const snapshot = buildSnapshot(source({ links: [] }));

    expect(publishBlockers(snapshot)).toContain('أضف وسيلة تواصل واحدة على الأقل');
  });

  it('يجمع كل الأسباب دفعة واحدة', () => {
    const snapshot = buildSnapshot(source({ defaultLocale: 'en', links: [] }));

    expect(publishBlockers(snapshot)).toHaveLength(2);
  });
});

describe('parseTheme', () => {
  it('يتجاهل الحقول غير المعروفة والقيم غير الصالحة', () => {
    expect(
      parseTheme({ primaryColor: 'red', borderRadius: 'huge', colorScheme: 'dark', evil: 'x' }),
    ).toEqual({ colorScheme: 'dark' });
  });

  it('يقبل لوناً بصيغة سداسية', () => {
    expect(parseTheme({ primaryColor: '#0F766E' })).toEqual({ primaryColor: '#0F766E' });
  });

  it('يعيد كائناً فارغاً لقيمة ليست كائناً', () => {
    expect(parseTheme(null)).toEqual({});
    expect(parseTheme('classic')).toEqual({});
  });
});

describe('parseSectionOrder', () => {
  it('يسقط الأقسام غير المعروفة والمكررة', () => {
    expect(parseSectionOrder(['identity', 'ghost', 'identity', 'links'])).toEqual([
      'identity',
      'links',
    ]);
  });

  it('يعيد مصفوفة فارغة لقيمة ليست مصفوفة', () => {
    expect(parseSectionOrder(undefined)).toEqual([]);
  });
});
