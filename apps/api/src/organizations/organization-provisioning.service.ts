import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { OUTBOX_EVENT_TYPES } from '@nomiqa/contracts';
import type { Prisma } from '@nomiqa/database';
import { SYSTEM_ROLES } from '@nomiqa/database';
import { deriveSlugBase, randomSuffix } from './slug.js';

const MAX_SLUG_ATTEMPTS = 5;

interface ProvisionInput {
  userId: string;
  email: string;
  fullName: string | null;
  requestId?: string;
}

/**
 * إنشاء المؤسسة الشخصية وعضوية المالك عند أول دخول.
 *
 * وثيقة المعمارية §6.10 تصنّف «إنشاء مؤسسة وعضوية المالك» كعملية يجب
 * أن تنجح أو تفشل كوحدة واحدة — ولذلك كل ما هنا يعمل داخل Transaction
 * واحدة يوفّرها المستدعي.
 *
 * كل مستخدم يملك مؤسسة واحدة على الأقل منذ لحظة إنشائه، فلا توجد
 * حالة «مستخدم بلا مؤسسة» يجب على بقية النظام التعامل معها.
 */
@Injectable()
export class OrganizationProvisioningService {
  private readonly logger = new Logger(OrganizationProvisioningService.name);

  /**
   * @param tx عميل داخل Transaction — ليس عميل Prisma الرئيسي.
   */
  async provisionPersonalOrganization(
    tx: Prisma.TransactionClient,
    input: ProvisionInput,
  ): Promise<{ organizationId: string; membershipId: string }> {
    const ownerRole = await tx.role.findFirst({
      where: { organizationId: null, key: SYSTEM_ROLES.OWNER },
    });

    if (!ownerRole) {
      // فشل صريح خير من إنشاء عضوية بلا صلاحيات تفشل لاحقاً بصمت.
      throw new InternalServerErrorException('الدور النظامي "owner" غير موجود — شغّل pnpm db:seed');
    }

    // نولّد المعرّف مسبقاً حتى نضبط سياق RLS قبل إدراج الصفوف التابعة.
    const organizationId = crypto.randomUUID();
    const slug = await this.allocateSlug(tx, input.email);

    const displayName = input.fullName?.trim() || input.email.split('@')[0] || 'مساحة العمل';

    await tx.organization.create({
      data: {
        id: organizationId,
        slug,
        name: displayName,
        kind: 'personal',
        defaultLocale: 'ar',
      },
    });

    // حرج: جداول العضويات والتدقيق والـoutbox عليها RLS بـFORCE.
    // بدون ضبط السياق هنا سيرفض PostgreSQL الإدراج بـWITH CHECK بمجرد
    // تشغيل التطبيق بدور NOBYPASSRLS كما هو مخطط للإنتاج.
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;

    const membership = await tx.organizationMembership.create({
      data: {
        organizationId,
        userId: input.userId,
        status: 'active',
        joinedAt: new Date(),
        roles: { create: { roleId: ownerRole.id } },
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: input.userId,
        action: 'organization.provisioned',
        resourceType: 'organization',
        resourceId: organizationId,
        outcome: 'success',
        requestId: input.requestId,
        // لا بريد ولا اسم هنا — البيانات الشخصية ممنوعة في السجلات (§9.4).
        metadata: { kind: 'personal', trigger: 'first_login' },
      },
    });

    await tx.outboxEvent.createMany({
      data: [
        {
          organizationId,
          eventType: OUTBOX_EVENT_TYPES.USER_REGISTERED,
          payload: { userId: input.userId },
        },
        {
          organizationId,
          eventType: OUTBOX_EVENT_TYPES.ORGANIZATION_CREATED,
          payload: { organizationId, ownerUserId: input.userId, kind: 'personal' },
        },
      ],
    });

    this.logger.log(`أُنشئت مؤسسة شخصية ${organizationId} بـslug ${slug}`);

    return { organizationId, membershipId: membership.id };
  }

  /**
   * يخصص slug فريداً. الـslug فريد عالمياً لأنه سيظهر في الروابط العامة.
   */
  private async allocateSlug(tx: Prisma.TransactionClient, email: string): Promise<string> {
    const base = deriveSlugBase(email);

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${randomSuffix()}`;
      const taken = await tx.organization.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!taken) {
        return candidate;
      }
    }

    // احتياط أخير: معرّف عشوائي كامل لا يتعارض عملياً.
    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }
}
