import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'nomiqa:requiredPermissions';

/** يشترط امتلاك كل الصلاحيات المذكورة داخل المؤسسة النشطة. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
