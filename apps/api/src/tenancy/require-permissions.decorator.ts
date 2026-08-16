import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'nomiqa:requiredPermissions';
export const SCOPED_PERMISSION_KEY = 'nomiqa:scopedPermission';

/** يشترط امتلاك كل الصلاحيات المذكورة على المؤسسة كلها. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

/**
 * يفتح المسار لمن يملك الصلاحية **على المؤسسة أو على أي نطاق** (§9.2).
 *
 * هذا إذنٌ بالمحاولة لا إذنٌ بالصف: مسؤول إدارة المبيعات يجتاز الحارس
 * إلى مسار «تعديل عضو»، ثم تتحقق الخدمة من أن العضو المستهدف في إدارته
 * فعلاً عبر `assertScopeCovers`. فصل الطبقتين مقصود — الحارس لا يرى
 * الصف المستهدف، ومحاولة تمرير التحقق إليه كانت ستعني تحميل الصف مرتين
 * أو تمرير معرّفات عبر الميتاداتا.
 *
 * **كل مسار يستخدم هذا المزيّن مسؤول عن استدعاء تحقق النطاق في الخدمة.**
 */
export const RequireScopedPermission = (permission: string) =>
  SetMetadata(SCOPED_PERMISSION_KEY, permission);
