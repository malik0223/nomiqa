import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RATE_LIMIT_KEY, SKIP_RATE_LIMIT_KEY } from './rate-limit.decorator.js';

/** Redis مزيّف يحاكي نتيجة multi().incr().expire().exec() */
function fakeRedis(counterValue: number | Error): Redis {
  return {
    multi: () => ({
      incr: () => ({
        expire: () => ({
          exec: () =>
            counterValue instanceof Error
              ? Promise.reject(counterValue)
              : Promise.resolve([
                  [null, counterValue],
                  [null, 1],
                ]),
        }),
      }),
    }),
  } as unknown as Redis;
}

function contextFor(user?: { id: string }): {
  context: ExecutionContext;
  headers: Record<string, unknown>;
} {
  const headers: Record<string, unknown> = {};
  const request = { user, ip: '203.0.113.9' };
  const response = {
    setHeader: (name: string, value: unknown) => {
      headers[name] = value;
    },
  };

  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getHandler: () => ({ name: 'handler' }),
    getClass: () => ({ name: 'TestController' }),
  } as unknown as ExecutionContext;

  return { context, headers };
}

function reflectorFor(values: Record<string, unknown>): Reflector {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(
    (key: unknown) => values[key as string] as never,
  );
  return reflector;
}

describe('RateLimitGuard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('يسمح ضمن الحد ويعيد ترويسات العدّاد', async () => {
    const { context, headers } = contextFor({ id: 'user-1' });
    const guard = new RateLimitGuard(
      reflectorFor({ [RATE_LIMIT_KEY]: { limit: 10, windowSeconds: 60 } }),
      fakeRedis(3),
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(headers['X-RateLimit-Limit']).toBe(10);
    expect(headers['X-RateLimit-Remaining']).toBe(7);
  });

  it('يرفض بـ429 عند تجاوز الحد ويضيف Retry-After', async () => {
    const { context, headers } = contextFor({ id: 'user-1' });
    const guard = new RateLimitGuard(
      reflectorFor({ [RATE_LIMIT_KEY]: { limit: 5, windowSeconds: 60 } }),
      fakeRedis(6),
    );

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    expect(headers['Retry-After']).toBeDefined();
  });

  it('يسمح عند الحد تماماً ويرفض بعده', async () => {
    const atLimit = new RateLimitGuard(
      reflectorFor({ [RATE_LIMIT_KEY]: { limit: 5, windowSeconds: 60 } }),
      fakeRedis(5),
    );
    await expect(atLimit.canActivate(contextFor({ id: 'u' }).context)).resolves.toBe(true);

    const overLimit = new RateLimitGuard(
      reflectorFor({ [RATE_LIMIT_KEY]: { limit: 5, windowSeconds: 60 } }),
      fakeRedis(6),
    );
    await expect(overLimit.canActivate(contextFor({ id: 'u' }).context)).rejects.toThrow();
  });

  it('يتجاوز الحد للمسارات المستثناة', async () => {
    const guard = new RateLimitGuard(
      reflectorFor({ [SKIP_RATE_LIMIT_KEY]: true }),
      fakeRedis(9999),
    );

    await expect(guard.canActivate(contextFor().context)).resolves.toBe(true);
  });

  it('يفشل مفتوحاً عند تعطل Redis بدل إسقاط الـAPI', async () => {
    const guard = new RateLimitGuard(
      reflectorFor({ [RATE_LIMIT_KEY]: { limit: 1, windowSeconds: 60 } }),
      fakeRedis(new Error('Redis غير متاح')),
    );

    // تعطّل Redis يجب ألا يمنع الخدمة كلها.
    await expect(guard.canActivate(contextFor({ id: 'u' }).context)).resolves.toBe(true);
  });
});
