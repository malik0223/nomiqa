import { SetMetadata } from '@nestjs/common';

export const NO_TENANT_KEY = 'nomiqa:noTenant';

/**
 * مسار يتطلب مصادقة لكن **لا** يتطلب مؤسسة نشطة.
 *
 * مخصص لمسارات الإقلاع التي تُستدعى قبل أن يعرف العميل مؤسسته أصلاً:
 * `/me` وقائمة المؤسسات وإنشاؤها.
 *
 * الفرق عن `@Public`: هذا يتحقق من الهوية ويرفض الزائر المجهول،
 * لكنه يتجاوز اشتراط ترويسة المؤسسة فقط.
 */
export const NoTenantRequired = () => SetMetadata(NO_TENANT_KEY, true);
