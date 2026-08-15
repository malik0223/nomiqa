import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { QUEUE_NAMES, type AccountDeletionJobData, type UserDataExport } from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { Auth0ManagementService } from '../auth/auth0-management.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { ConsentsService } from './consents.service.js';

@Injectable()
export class AccountService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountService.name);
  private queue!: Queue<AccountDeletionJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentsService,
    private readonly auth0Management: Auth0ManagementService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.queue = new Queue<AccountDeletionJobData>(QUEUE_NAMES.ACCOUNT_DELETION, {
      connection: this.redis,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  /**
   * ينتج نسخة من بيانات المستخدم (§6.2).
   *
   * يُولَّد فورياً لأن حجم البيانات في هذه المرحلة صغير. عند إضافة
   * البطاقات وجهات الاتصال والتحليلات يجب نقله إلى الطابور وتسليمه
   * كملف موقّع، وإلا صار طلب التصدير عملية طويلة داخل طلب HTTP.
   */
  async exportData(userId: string): Promise<UserDataExport> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ConflictException('المستخدم غير موجود');
    }

    const memberships = await withRlsContext(this.prisma, { userId }, (tx) =>
      tx.organizationMembership.findMany({
        where: { userId },
        include: { organization: true, roles: { include: { role: true } } },
      }),
    );

    const consentHistory = await this.consents.history(userId);

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        locale: user.locale,
        timeZone: user.timeZone,
        createdAt: user.createdAt.toISOString(),
      },
      organizations: memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        roles: membership.roles.map((link) => link.role.key),
        joinedAt: membership.joinedAt?.toISOString() ?? null,
      })),
      consents: consentHistory.map((consent) => ({
        purpose: consent.purpose,
        granted: consent.granted,
        documentVersion: consent.documentVersion,
        recordedAt: consent.createdAt.toISOString(),
      })),
    };
  }

  /**
   * يبدأ حذف الحساب.
   *
   * الترتيب مقصود:
   *   1. رفض مبكر إن كانت بيانات Auth0 Management ناقصة — الحذف
   *      الجزئي أسوأ من عدم البدء، لأنه يترك الهوية قائمة لدى المزوّد
   *      بينما تختفي بياناتنا.
   *   2. تعطيل العضويات فوراً حتى يفقد الوصول قبل اكتمال الحذف.
   *   3. إدراج المهمة في الطابور لتنفيذ الحذف الفعلي مع إعادة محاولة.
   */
  async requestDeletion(userId: string): Promise<{ requestId: string }> {
    if (!this.auth0Management.isConfigured()) {
      throw new ServiceUnavailableException(
        'حذف الحساب غير متاح حالياً: إعداد Auth0 Management API ناقص',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ConflictException('المستخدم غير موجود');
    }
    if (user.deletedAt) {
      throw new ConflictException('طلب الحذف قيد التنفيذ بالفعل');
    }

    const requestId = crypto.randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;

      await tx.dataSubjectRequest.create({
        data: {
          id: requestId,
          subjectUserId: userId,
          subjectEmailHash: hashEmail(user.email),
          type: 'deletion',
          status: 'pending',
        },
      });

      // وسم الحساب محذوفاً يمنع الدخول فوراً عبر UserProvisioningService،
      // فلا يبقى الوصول قائماً طوال مدة تنفيذ الطابور.
      await tx.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });

      await tx.organizationMembership.updateMany({
        where: { userId },
        data: { status: 'revoked', revokedAt: new Date() },
      });
    });

    await this.queue.add(
      'delete-account',
      { requestId, userId, auth0UserId: user.auth0UserId },
      {
        jobId: requestId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 30 * 24 * 3_600 },
      },
    );

    this.logger.log(`بدأ حذف حساب — الطلب ${requestId}`);
    return { requestId };
  }

  async listRequests(userId: string) {
    return withRlsContext(this.prisma, { userId }, (tx) =>
      tx.dataSubjectRequest.findMany({
        where: { subjectUserId: userId },
        orderBy: { requestedAt: 'desc' },
        take: 20,
      }),
    );
  }
}

export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
