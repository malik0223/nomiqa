import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ApiKeyIssued, ApiKeyScope, ApiKeySummary } from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import type { ApiKeyCreateInput } from '@nomiqa/validation';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateApiKey } from './api-key-token.js';

/**
 * مفاتيح الـAPI العام (§11.4 خطوة 1).
 *
 * ما يميّز هذا المورد عن كل ما سبقه في المنصة: **المفتاح لا ينتهي
 * بتسجيل خروج ولا يظهر في سجل دخول**. عضو يغادر المؤسسة تُلغى عضويته
 * فيُقفل بابه في اللحظة نفسها؛ مفتاح نسخه أحدهم إلى حاسوبه الشخصي
 * يبقى يعمل إلى أن يلاحظه إنسان في قائمة.
 *
 * ولذلك ثلاثة ضوابط لا يجوز تخفيفها: يُعرض مرة واحدة، ويُخزَّن مجزّأً،
 * ويظهر آخر استخدام له في القائمة — فمفتاح لم يُستخدم منذ شهور سؤالٌ
 * يطرحه من يقرأ الشاشة على نفسه بلا أن نطلب منه.
 */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(organizationId: string): Promise<ApiKeySummary[]> {
    const keys = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.apiKey.findMany({ orderBy: { createdAt: 'desc' } }),
    );

    return keys.map(toSummary);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    input: ApiKeyCreateInput,
  ): Promise<ApiKeyIssued> {
    await this.requireFeature(organizationId);

    const generated = generateApiKey();

    const key = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const created = await tx.apiKey.create({
        data: {
          organizationId,
          name: input.name,
          prefix: generated.prefix,
          tokenHash: generated.tokenHash,
          scopes: input.scopes,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'integrations.api_key_created',
          resourceType: 'api_key',
          resourceId: created.id,
          outcome: 'success',
          // البادئة لا المفتاح: السجل يجب أن يميّز أيّ مفتاح أُنشئ،
          // ولا يجوز أن يحمل ما يكفي لاستخدامه.
          metadata: { prefix: generated.prefix, scopes: input.scopes },
        },
      });

      return created;
    });

    return { ...toSummary(key), token: generated.token };
  }

  /**
   * يُبطل مفتاحاً.
   *
   * إبطال لا حذف: صفٌّ محذوف يترك سؤالاً بلا جواب حين يُلاحَظ استخدام
   * غريب في السجلات بعد أسابيع — أيّ مفتاح كان، ومن أنشأه، ومتى أُلغي.
   */
  async revoke(organizationId: string, actorUserId: string, keyId: string): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const updated = await tx.apiKey.updateMany({
        where: { id: keyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedByUserId: actorUserId },
      });

      if (updated.count === 0) {
        throw new NotFoundException('المفتاح غير موجود');
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'integrations.api_key_revoked',
          resourceType: 'api_key',
          resourceId: keyId,
          outcome: 'success',
        },
      });
    });
  }

  private async requireFeature(organizationId: string): Promise<void> {
    if (!(await this.entitlements.hasFeature(organizationId, 'public_api'))) {
      throw new ForbiddenException('الـAPI العام غير متاح في باقتك الحالية');
    }
  }
}

function toSummary(key: {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): ApiKeySummary {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes as ApiKeyScope[],
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  };
}
