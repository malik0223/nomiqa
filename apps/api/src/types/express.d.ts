import type { AuthenticatedUser, TenantContext } from '@nomiqa/contracts';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenant?: TenantContext;
      requestId?: string;
    }
  }
}

export {};
