import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'nomiqa:rateLimit';
export const SKIP_RATE_LIMIT_KEY = 'nomiqa:skipRateLimit';

export interface RateLimitOptions {
  /** عدد الطلبات المسموحة داخل النافذة. */
  limit: number;
  /** طول النافذة بالثواني. */
  windowSeconds: number;
}

/**
 * حد أشد للمسار. يُستخدم في المسارات المكلفة أو الحساسة:
 * طلب رابط رفع، حذف الحساب، النماذج العامة.
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/** يستثني المسار من الحد — لفحوص الصحة التي يستدعيها موازن الحمل. */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
