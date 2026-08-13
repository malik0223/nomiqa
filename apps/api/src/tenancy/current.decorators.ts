import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new InternalServerErrorException('@CurrentUser مستخدم في مسار غير محمي');
    }
    return request.user;
  },
);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.tenant) {
      throw new InternalServerErrorException('@CurrentTenant مستخدم في مسار بلا سياق مؤسسة');
    }
    return request.tenant;
  },
);
