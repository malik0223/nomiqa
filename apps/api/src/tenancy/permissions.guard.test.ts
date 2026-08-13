import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsGuard } from './permissions.guard.js';

function contextWithPermissions(permissions: string[]): ExecutionContext {
  const request = { tenant: { permissions } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

function reflectorReturning(required: string[] | undefined): Reflector {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  return reflector;
}

describe('PermissionsGuard', () => {
  it('يسمح عندما تتوفر كل الصلاحيات المطلوبة', () => {
    const guard = new PermissionsGuard(reflectorReturning(['cards:write']));
    expect(guard.canActivate(contextWithPermissions(['cards:read', 'cards:write']))).toBe(true);
  });

  it('يرفض عند نقص أي صلاحية مطلوبة', () => {
    const guard = new PermissionsGuard(reflectorReturning(['cards:write', 'cards:publish']));
    expect(() => guard.canActivate(contextWithPermissions(['cards:write']))).toThrow(
      ForbiddenException,
    );
  });

  it('يرفض عندما لا يوجد سياق مؤسسة أصلاً', () => {
    const guard = new PermissionsGuard(reflectorReturning(['cards:read']));
    const context = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => vi.fn(),
      getClass: () => vi.fn(),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
