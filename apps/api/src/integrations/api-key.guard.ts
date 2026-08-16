import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiKeyScope } from '@nomiqa/contracts';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_KEY_SCOPE_KEY } from './api-key.decorator.js';
import { hashApiKey, readApiKeyPrefix } from './api-key-token.js';

export const API_KEY_HEADER = 'x-api-key';

/**
 * مصادقة الـAPI العام بمفتاح (§11.4).
 *
 * يعمل **بدل** سلسلة (Auth0 → عضوية → صلاحية) لا بعدها: الطالب نظام
 * لا شخص، فلا مستخدم ولا عضوية ولا دور. وما يقابل الصلاحية هنا نطاق
 * المفتاح، وهو أضيق منها عمداً.
 *
 * ثلاثة تفاصيل تحمل الوزن كله:
 *
 *  1. **البحث بالتجزئة لا بالبادئة.** البادئة للعرض؛ لو بحثنا بها ثم
 *     قارنّا لصار الفرق بين «مفتاح مجهول» و«مفتاح خاطئ» مقروءاً في
 *     زمن الاستجابة.
 *  2. **البحث خارج سياق المؤسسة.** المفتاح يصل وحده بلا ترويسة مؤسسة —
 *     ولا يمكن أن تُشتق المؤسسة إلا منه. لذلك يستعلم هذا الحارس
 *     بالعميل غير المقيَّد، وهو الاستثناء **الوحيد** المسموح به،
 *     ومقصور على جدول لا يحمل بيانات أعمال.
 *  3. **سياق المؤسسة يُبنى من الصف** ثم تُقيَّد كل قراءة لاحقة به.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ApiKeyScope>(API_KEY_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // ليس مسار مفتاح: تتولاه الحرّاس الأخرى كما كانت دائماً.
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.header(API_KEY_HEADER)?.trim();

    if (!token || !readApiKeyPrefix(token)) {
      // الشكل يُفحص قبل أي استعلام: نص عشوائي لا يستحق رحلة إلى
      // قاعدة البيانات، وإلا صار المسار قناة إغراق رخيصة.
      throw new UnauthorizedException('مفتاح API مفقود أو غير صالح');
    }

    const key = await this.prisma.apiKey.findUnique({
      where: { tokenHash: hashApiKey(token) },
      select: {
        id: true,
        organizationId: true,
        scopes: true,
        revokedAt: true,
        expiresAt: true,
        organization: { select: { deletedAt: true, suspendedAt: true } },
      },
    });

    const now = new Date();

    // رسالة واحدة للحالات الأربع: غير موجود، مُبطل، منتهٍ، لمؤسسة
    // محذوفة. التمييز بينها يخبر من يجرّب مفاتيح أيّها كان صحيحاً يوماً.
    if (
      !key ||
      key.revokedAt !== null ||
      (key.expiresAt !== null && key.expiresAt <= now) ||
      key.organization.deletedAt !== null
    ) {
      throw new UnauthorizedException('مفتاح API غير صالح');
    }

    if (!key.scopes.includes(required)) {
      throw new ForbiddenException('نطاق المفتاح لا يشمل هذه العملية');
    }

    // التعليق **لا يُفحص هنا**: `SuspensionGuard` يعمل بعد هذا الحارس
    // ويقرأ `tenant.suspended` نفسه. نسخة ثانية من القاعدة كانت تعني
    // مساراً يسمح بما يمنعه الآخر أول مرة تُعدَّل إحداهما.
    request.tenant = {
      organizationId: key.organizationId,
      // مفتاح لا عضوية: الحقول الأربعة فارغة عمداً، فأي مسار يقرأ
      // `permissions` بافتراض وجود دور يرفض بدل أن يمرّر.
      membershipId: '',
      roles: [],
      permissions: [],
      scopedPermissions: [],
      suspended: key.organization.suspendedAt !== null,
    };
    request.apiKeyId = key.id;

    // آخر استخدام خارج المسار الحرج: تحديثه بانتظار الرد يضيف كتابة
    // إلى **كل** طلب API. وفشله لا يجوز أن يُسقط الطلب — هو معلومة
    // تشغيلية لا شرط وصول.
    void this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: now } })
      .catch(() => undefined);

    return true;
  }
}
