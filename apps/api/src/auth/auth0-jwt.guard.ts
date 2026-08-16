import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { API_KEY_SCOPE_KEY } from '../integrations/api-key.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { UserProvisioningService } from './user-provisioning.service.js';

/**
 * التحقق من Access Token الصادر من Auth0 (ADR-010).
 *
 * ما يتحقق منه هذا الحارس:
 *  - التوقيع مقابل مفاتيح JWKS العامة للـTenant (مع تخزين مؤقت داخلي).
 *  - المُصدِر issuer يطابق نطاق الـTenant بالضبط.
 *  - الجمهور audience يطابق معرّف الـAPI المسجّل.
 *  - صلاحية الوقت exp/nbf.
 *
 * ما لا يفعله عمداً: قراءة أي صلاحية من الـToken.
 * صلاحيات المنصة تُقرأ من قاعدة بياناتنا في TenantContextGuard.
 */
@Injectable()
export class Auth0JwtGuard implements CanActivate {
  private readonly logger = new Logger(Auth0JwtGuard.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly userProvisioning: UserProvisioningService,
  ) {
    const domain = process.env.AUTH0_DOMAIN;
    const audience = process.env.AUTH0_AUDIENCE;

    if (!domain || !audience) {
      throw new Error('AUTH0_DOMAIN و AUTH0_AUDIENCE مطلوبان لتشغيل الـAPI');
    }

    this.issuer = `https://${domain}/`;
    this.audience = audience;
    this.jwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`), {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // مسارات الـAPI العام بمفتاح (§11.4): هويتها مفتاح لا مستخدم،
    // و`ApiKeyGuard` يتولاها بالكامل. تركها هنا كان يعني رفضها لغياب
    // رمز Auth0 قبل أن يصل الطلب إلى الحارس الذي يفهمه.
    const apiKeyScope = this.reflector.getAllAndOverride<string>(API_KEY_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (apiKeyScope) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('رمز الوصول مفقود');
    }

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      payload = verified.payload;
    } catch (error) {
      // لا نسرّب سبب الفشل للعميل، لكن نسجّله للتشخيص.
      this.logger.debug(`فشل التحقق من الرمز: ${(error as Error).message}`);
      throw new UnauthorizedException('رمز وصول غير صالح');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('الرمز لا يحتوي على معرّف مستخدم');
    }

    // ربط هوية Auth0 بسجل المستخدم المحلي، وإنشاؤه عند أول دخول.
    request.user = await this.userProvisioning.resolveUser(payload, request.requestId);
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value;
}
