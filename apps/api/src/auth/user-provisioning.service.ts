import { Injectable, Logger } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import type { AuthenticatedUser } from '@nomiqa/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * يربط هوية Auth0 بسجل المستخدم المحلي.
 *
 * Auth0 مصدر الهوية؛ قاعدة بياناتنا مصدر صلاحيات المنتج.
 * عند أول دخول يُنشأ سجل محلي مرتبط بـauth0UserId (الـsub)،
 * وهو المعرّف الوحيد الثابت — البريد قابل للتغيير ولا يصلح مفتاحاً.
 */
@Injectable()
export class UserProvisioningService {
  private readonly logger = new Logger(UserProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveUser(payload: JWTPayload): Promise<AuthenticatedUser> {
    const auth0UserId = payload.sub!;
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    const emailVerified = payload.email_verified === true;
    const fullName = typeof payload.name === 'string' ? payload.name : null;

    const existing = await this.prisma.user.findUnique({ where: { auth0UserId } });

    if (existing) {
      if (existing.deletedAt) {
        // حساب محذوف محلياً لا يُعاد إحياؤه ضمنياً عند تقديم رمز صالح.
        throw new Error('الحساب محذوف');
      }

      // نحدّث فقط عند التغيّر الفعلي لتفادي كتابة على كل طلب.
      const needsUpdate =
        (email !== null && existing.email !== email) ||
        existing.emailVerified !== emailVerified ||
        (fullName !== null && existing.fullName !== fullName);

      if (needsUpdate) {
        const updated = await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            ...(email ? { email } : {}),
            emailVerified,
            ...(fullName ? { fullName } : {}),
            lastLoginAt: new Date(),
          },
        });
        return toAuthenticatedUser(updated);
      }

      return toAuthenticatedUser(existing);
    }

    if (!email) {
      throw new Error('الرمز لا يحتوي على بريد إلكتروني — تحقق من إعداد Scopes في Auth0');
    }

    this.logger.log(`إنشاء سجل مستخدم محلي لهوية Auth0 جديدة`);

    const created = await this.prisma.user.create({
      data: {
        auth0UserId,
        email,
        emailVerified,
        fullName,
        lastLoginAt: new Date(),
      },
    });

    return toAuthenticatedUser(created);
  }
}

function toAuthenticatedUser(user: {
  id: string;
  auth0UserId: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
}): AuthenticatedUser {
  return {
    id: user.id,
    auth0UserId: user.auth0UserId,
    email: user.email,
    emailVerified: user.emailVerified,
    fullName: user.fullName,
  };
}
