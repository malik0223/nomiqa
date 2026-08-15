import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * حارس صلاحية إدارة المنصة.
 *
 * يُقرأ من قاعدة البيانات في كل طلب لا من الرمز: سحب الصلاحية يجب
 * أن يسري فوراً، وهذه أخطر صلاحية في النظام فلا تُترك سارية حتى
 * انتهاء رمز عمره ساعة.
 *
 * كل رفض يُسجَّل: محاولة وصول إلى مسار إداري من غير مخوَّل حدث أمني
 * يستحق التحقيق، لا مجرد خطأ صلاحيات عادي.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  private readonly logger = new Logger(PlatformAdminGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('غير مصرّح');
    }

    const admin = await this.prisma.platformAdmin.findFirst({
      where: { userId: user.id, revokedAt: null },
    });

    if (!admin) {
      this.logger.warn(
        `محاولة وصول إداري مرفوضة — المستخدم ${user.id} — الطلب ${request.requestId ?? 'غير معروف'}`,
      );
      // نفس رسالة أي رفض آخر: لا نؤكد للمستطلع وجود مسارات إدارية.
      throw new ForbiddenException('غير مصرّح');
    }

    return true;
  }
}
