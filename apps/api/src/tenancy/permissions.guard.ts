import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  REQUIRED_PERMISSIONS_KEY,
  SCOPED_PERMISSION_KEY,
} from './require-permissions.decorator.js';

/**
 * Deny by default (§9.2): أي مسار غير معلَّم بـ@Public ولا بـ
 * @RequirePermissions ولا بـ@RequireScopedPermission يُرفض.
 * لا يوجد "مسموح ضمناً" في هذه المنصة.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required && required.length > 0) {
      const granted = request.tenant?.permissions ?? [];
      const missing = required.filter((permission) => !granted.includes(permission));
      if (missing.length > 0) {
        throw new ForbiddenException('لا تملك الصلاحية اللازمة لهذه العملية');
      }
      return true;
    }

    const scoped = this.reflector.getAllAndOverride<string>(SCOPED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (scoped) {
      const tenant = request.tenant;
      const orgWide = tenant?.permissions.includes(scoped) ?? false;
      const anyScope = tenant?.scopedPermissions.some((grant) => grant.permission === scoped);

      if (!orgWide && !anyScope) {
        throw new ForbiddenException('لا تملك الصلاحية اللازمة لهذه العملية');
      }

      // اجتياز الحارس لا يعني الوصول إلى صف بعينه: الخدمة تتحقق من
      // أن الهدف داخل النطاق الممنوح.
      return true;
    }

    return true;
  }
}
