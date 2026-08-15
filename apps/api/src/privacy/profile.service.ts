import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { UserProfile } from '@nomiqa/contracts';
import type { ProfileUpdateInput } from '@nomiqa/validation';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashEmail } from './account.service.js';

/**
 * الحقول التي تُعدّ **بيانات شخصية**، فتعديلها ممارسة لحق التصحيح
 * ويستوجب سجل طلب.
 *
 * اللغة والمنطقة الزمنية تفضيلات عرض لا بيانات شخصية، فتغييرها
 * تحديث إعدادات عادي. الخلط بينهما يغرق سجل الطلبات بضجيج يخفي
 * الطلبات الحقيقية.
 */
const PERSONAL_DATA_FIELDS = new Set(['fullName']);

export interface ProfileUpdateContext {
  /** يربط السجل بالطلب في سجلات التطبيق عند التحقيق. */
  requestId?: string;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    return toProfile(user);
  }

  /**
   * يحدّث الملف الشخصي.
   *
   * يسجّل طلب تصحيح فقط عند تغيّر بيانات شخصية فعلاً — لا عند إرسال
   * القيمة نفسها، ولا عند تغيير التفضيلات.
   */
  async update(
    userId: string,
    input: ProfileUpdateInput,
    context: ProfileUpdateContext = {},
  ): Promise<UserProfile> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    const changedFields = Object.entries(input)
      .filter(([key, value]) => (existing as Record<string, unknown>)[key] !== value)
      .map(([key]) => key);

    if (changedFields.length === 0) {
      return toProfile(existing);
    }

    const correctsPersonalData = changedFields.some((field) => PERSONAL_DATA_FIELDS.has(field));

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;

      const user = await tx.user.update({ where: { id: userId }, data: input });

      if (correctsPersonalData) {
        // سجل التصحيح يثبت الاستجابة للحق، ويُنشأ مكتملاً لأن
        // التنفيذ تم في هذه المعاملة نفسها.
        await tx.dataSubjectRequest.create({
          data: {
            subjectUserId: userId,
            subjectEmailHash: hashEmail(existing.email),
            type: 'rectification',
            status: 'completed',
            completedAt: new Date(),
            // أسماء الحقول فقط — لا قيم قديمة ولا جديدة، وإلا صار
            // السجل نسخة احتياطية من البيانات التي طُلب تصحيحها.
            outcome: {
              fields: changedFields.filter((field) => PERSONAL_DATA_FIELDS.has(field)),
              ...(context.requestId ? { requestId: context.requestId } : {}),
            },
          },
        });
      }

      return user;
    });

    this.logger.log(`حُدّث الملف الشخصي — الحقول: ${changedFields.join(', ')}`);

    return toProfile(updated);
  }
}

function toProfile(user: {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
  locale: string;
  timeZone: string;
  createdAt: Date;
}): UserProfile {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    fullName: user.fullName,
    locale: user.locale,
    timeZone: user.timeZone,
    createdAt: user.createdAt.toISOString(),
  };
}
