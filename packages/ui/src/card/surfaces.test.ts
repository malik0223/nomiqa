import { describe, expect, it } from 'vitest';
import { CARD_SURFACES } from '@nomiqa/contracts';
import { surfaceStyle, surfaceSwatch } from './surfaces';

describe('surfaceStyle', () => {
  it('يعرف كل سطح معلن في العقد', () => {
    for (const surface of CARD_SURFACES) {
      expect(surfaceStyle(surface).article, surface).toBeTruthy();
    }
  });

  /**
   * الحارس الأهم: لقطة منشورة قبل وجود الأسطح لا تحمل `surface`، ولقطة
   * من إصدار أحدث قد تحمل سطحاً لا تعرفه هذه النسخة بعد. كلتاهما يجب أن
   * تُعرض بالسلوك الأصلي، لا أن تُسقط الصفحة العامة.
   */
  it('يسقط إلى flat عند الغياب أو عند سطح مجهول', () => {
    const flat = surfaceStyle('flat');
    expect(surfaceStyle(undefined)).toEqual(flat);
    expect(surfaceStyle('surface-from-the-future')).toEqual(flat);
  });

  it('يبقي سطح flat مطابقاً للعرض الأصلي', () => {
    const flat = surfaceStyle('flat');
    expect(flat.coverMode).toBe('band');
    expect(flat.linkLayout).toBe('stack');
    expect(flat.avatarShape).toBe('circle');
    expect(flat.layers).toHaveLength(0);
    expect(flat.article).toContain('bg-white');
  });

  it('يمنح كل سطح حاوية مختلفة عن غيره', () => {
    // أصناف حاوية متطابقة تعني قالبين لا يفترقان بصرياً — وهي الحالة
    // التي وُجد هذا الجدول لإصلاحها (كان classic وbold متطابقين).
    const articles = CARD_SURFACES.map((surface) => surfaceStyle(surface).article);
    expect(new Set(articles).size).toBe(CARD_SURFACES.length);
  });

  it('الغلاف يملأ البطاقة في زجاج وحده', () => {
    const filling = CARD_SURFACES.filter((s) => surfaceStyle(s).coverMode === 'fill');
    expect(filling).toEqual(['glass']);
  });

  it('يعطي بنتو شبكة وصحيفة أسطراً نصية', () => {
    expect(surfaceStyle('bento').linkLayout).toBe('grid');
    expect(surfaceStyle('editorial').linkLayout).toBe('text');
  });
});

describe('surfaceSwatch', () => {
  it('يعطي كل سطح لونين ويسقط إلى flat عند المجهول', () => {
    for (const surface of CARD_SURFACES) {
      const swatch = surfaceSwatch(surface);
      expect(swatch.bg, surface).toMatch(/^#[0-9a-f]{6}$/i);
      expect(swatch.ink, surface).toMatch(/^#[0-9a-f]{6}$/i);
    }

    expect(surfaceSwatch('nope')).toEqual(surfaceSwatch('flat'));
  });
});
