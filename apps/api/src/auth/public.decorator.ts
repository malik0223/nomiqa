import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'nomiqa:isPublic';

/**
 * يستثني المسار من المصادقة.
 *
 * يُستخدم حصراً في: صفحة البطاقة العامة، نموذج تبادل التواصل،
 * ومسارات الصحة. أي استخدام آخر يجب أن يُبرَّر في مراجعة الشيفرة.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
