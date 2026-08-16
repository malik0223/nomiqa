import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  WebhookDeliverySummary,
  WebhookEndpointIssued,
  WebhookEndpointSummary,
  WebhookEventType,
} from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import type { WebhookEndpointInput } from '@nomiqa/validation';
import { isIP } from 'node:net';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateWebhookSecret } from './webhook-signature.js';

/**
 * وجهات Webhook (§11.4 خطوة 1).
 *
 * الخطوة الأولى في ترتيب التكاملات ليست اختياراً تقنياً: Webhook
 * وREST يجعلان **كل** تكامل لاحق ممكناً بيد العميل — Zapier وMake
 * وأي نظام داخلي لا نعرفه — بينما وصلة مباشرة إلى مزوّد واحد تخدم
 * مستخدمي ذلك المزوّد وحدهم. نبدأ بما يفتح الباب لا بما يخدم اسماً.
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(organizationId: string): Promise<WebhookEndpointSummary[]> {
    const endpoints = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.webhookEndpoint.findMany({ orderBy: { createdAt: 'desc' } }),
    );

    return endpoints.map(toSummary);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    input: WebhookEndpointInput,
  ): Promise<WebhookEndpointIssued> {
    await this.requireFeature(organizationId);
    assertPublicUrl(input.url);

    const secret = generateWebhookSecret();

    const endpoint = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const created = await tx.webhookEndpoint.create({
        data: {
          organizationId,
          url: input.url,
          description: input.description ?? null,
          secret,
          eventTypes: input.eventTypes,
          isActive: input.isActive,
          createdByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'integrations.webhook_created',
          resourceType: 'webhook_endpoint',
          resourceId: created.id,
          outcome: 'success',
          // العنوان لا السرّ. العنوان إعداد يراه من يقرأ السجل ليفهم
          // أين تذهب بيانات المؤسسة.
          metadata: { url: input.url, eventTypes: input.eventTypes },
        },
      });

      return created;
    });

    // السرّ يُعاد مرة واحدة هنا فقط، كالمفتاح: بعدها لا سبيل إلى
    // قراءته من أي مسار — يُستبدل ولا يُعرض.
    return { ...toSummary(endpoint), secret };
  }

  /**
   * يعدّل وجهة.
   *
   * التعديل **يعيد تفعيل** ما أُوقف آلياً ويصفّر عدّاد الفشل: من يفتح
   * الشاشة ويصحّح العنوان يقصد تشغيلها، وإجباره على ضغطة ثانية بعدها
   * يترك وجهات معطّلة لا يعرف أصحابها لماذا بقيت صامتة.
   */
  async update(
    organizationId: string,
    actorUserId: string,
    endpointId: string,
    input: WebhookEndpointInput,
  ): Promise<WebhookEndpointSummary> {
    await this.requireFeature(organizationId);
    assertPublicUrl(input.url);

    const endpoint = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const existing = await tx.webhookEndpoint.findFirst({ where: { id: endpointId } });

      if (!existing) {
        throw new NotFoundException('الوجهة غير موجودة');
      }

      const updated = await tx.webhookEndpoint.update({
        where: { id: endpointId },
        data: {
          url: input.url,
          description: input.description ?? null,
          eventTypes: input.eventTypes,
          isActive: input.isActive,
          consecutiveFailures: 0,
          disabledAt: null,
          disabledReason: null,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'integrations.webhook_updated',
          resourceType: 'webhook_endpoint',
          resourceId: endpointId,
          outcome: 'success',
          metadata: { url: input.url, isActive: input.isActive },
        },
      });

      return updated;
    });

    return toSummary(endpoint);
  }

  async remove(organizationId: string, actorUserId: string, endpointId: string): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const deleted = await tx.webhookEndpoint.deleteMany({ where: { id: endpointId } });

      if (deleted.count === 0) {
        throw new NotFoundException('الوجهة غير موجودة');
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'integrations.webhook_deleted',
          resourceType: 'webhook_endpoint',
          resourceId: endpointId,
          outcome: 'success',
        },
      });
    });
  }

  /** آخر التسليمات لوجهة — الشاشة الوحيدة التي تجيب «لماذا لم يصل؟». */
  async deliveries(
    organizationId: string,
    endpointId: string,
  ): Promise<WebhookDeliverySummary[]> {
    const deliveries = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const endpoint = await tx.webhookEndpoint.findFirst({
        where: { id: endpointId },
        select: { id: true },
      });

      if (!endpoint) {
        throw new NotFoundException('الوجهة غير موجودة');
      }

      return tx.webhookDelivery.findMany({
        where: { endpointId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    return deliveries.map((delivery) => ({
      id: delivery.id,
      eventType: delivery.eventType as WebhookEventType,
      eventId: delivery.eventId,
      status: delivery.status as WebhookDeliverySummary['status'],
      attempts: delivery.attempts,
      responseStatus: delivery.responseStatus,
      error: delivery.error,
      nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
      deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
      createdAt: delivery.createdAt.toISOString(),
    }));
  }

  private async requireFeature(organizationId: string): Promise<void> {
    if (!(await this.entitlements.hasFeature(organizationId, 'webhooks'))) {
      throw new ForbiddenException('الـWebhooks غير متاحة في باقتك الحالية');
    }
  }
}

/**
 * يمنع العناوين الداخلية (SSRF).
 *
 * الخطر ملموس لا نظري: مسار يقبل عنواناً من مستخدم ثم **يناديه خادمنا**
 * هو تعريف الثغرة. عنوان كـ`https://169.254.169.254/...` يجعل خادمنا
 * يقرأ بيانات اعتماد السحابة ويسلّمها إلى من كتب العنوان.
 *
 * الفحص على الاسم لا على ما يحلّه الاسم: المحلّل قد يعيد عنواناً
 * داخلياً بعد الفحص (DNS Rebinding). لذلك يُعاد هذا الفحص في المرسل
 * أيضاً، والحماية الحقيقية في الإنتاج تبقى بوابة خروج مضبوطة.
 */
export function assertPublicUrl(raw: string): void {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('رابط غير صالح');
  }

  if (url.protocol !== 'https:') {
    throw new BadRequestException('يجب أن يبدأ الرابط بـhttps');
  }

  if (isPrivateHost(url.hostname)) {
    throw new BadRequestException('لا يمكن استخدام عنوان داخلي');
  }
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return true;
  }

  if (isIP(host) === 0) {
    // اسم نطاق عادي. لا نحلّه هنا — راجع تعليق `assertPublicUrl`.
    return false;
  }

  if (host.startsWith('::1') || host.startsWith('fc') || host.startsWith('fd')) {
    return true;
  }

  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [first = 0, second = 0] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

function toSummary(endpoint: {
  id: string;
  url: string;
  description: string | null;
  eventTypes: string[];
  isActive: boolean;
  disabledAt: Date | null;
  disabledReason: string | null;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
}): WebhookEndpointSummary {
  return {
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    eventTypes: endpoint.eventTypes as WebhookEventType[],
    isActive: endpoint.isActive,
    disabledAt: endpoint.disabledAt?.toISOString() ?? null,
    disabledReason: endpoint.disabledReason,
    consecutiveFailures: endpoint.consecutiveFailures,
    lastSuccessAt: endpoint.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: endpoint.lastFailureAt?.toISOString() ?? null,
    createdAt: endpoint.createdAt.toISOString(),
  };
}
