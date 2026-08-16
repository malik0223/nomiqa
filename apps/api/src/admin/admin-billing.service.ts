import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OUTBOX_EVENT_TYPES } from '@nomiqa/contracts';
import { Prisma, withRlsContext } from '@nomiqa/database';
import type { z } from 'zod';
import type {
  suspendOrganizationSchema,
  upsertCouponSchema,
  upsertPlanPriceSchema,
  upsertPlanSchema,
} from '@nomiqa/validation';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminService } from './admin.service.js';

/**
 * إدارة الخطط والاشتراكات والإيراد من لوحة المنصة (خارطة الطريق §9.5).
 *
 * القاعدة 11 سارية بلا استثناء: **كل ما يُقرأ هنا مجمَّع أو وصفي.**
 * تقارير الإيراد تأتي من دوال SECURITY DEFINER تُرجع مجاميع، لا من
 * استعلام على جدول الفواتير — وهو الفرق بين «كم أَدخلت المنصة هذا
 * الشهر» و«ماذا تدفع شركة بعينها».
 *
 * كل عملية تغيير تُسجَّل في `platform_audit_logs`: صلاحية تتجاوز حدود
 * المؤسسات بلا سجل هي صلاحية بلا مساءلة.
 */
@Injectable()
export class AdminBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
  ) {}

  // ---------------------------------------------------------------
  // الباقات والأسعار
  // ---------------------------------------------------------------

  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { prices: true, _count: { select: { subscriptions: true } } },
    });

    return plans.map((plan) => ({
      id: plan.id,
      key: plan.key,
      name: plan.name,
      nameEn: plan.nameEn,
      limits: plan.limits,
      features: plan.features,
      trialDays: plan.trialDays,
      isPublic: plan.isPublic,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      subscriberCount: plan._count.subscriptions,
      prices: plan.prices.map((price) => ({
        id: price.id,
        interval: price.interval,
        currency: price.currency,
        amountBaisa: price.amountBaisa,
        isActive: price.isActive,
      })),
    }));
  }

  async upsertPlan(
    actorUserId: string,
    input: z.infer<typeof upsertPlanSchema>,
    requestId?: string,
  ): Promise<{ id: string }> {
    const plan = await this.prisma.plan.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        name: input.name,
        nameEn: input.nameEn ?? null,
        description: input.description ?? null,
        descriptionEn: input.descriptionEn ?? null,
        limits: input.limits,
        features: input.features,
        trialDays: input.trialDays,
        isPublic: input.isPublic,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
      update: {
        name: input.name,
        nameEn: input.nameEn ?? null,
        description: input.description ?? null,
        descriptionEn: input.descriptionEn ?? null,
        limits: input.limits,
        features: input.features,
        trialDays: input.trialDays,
        isPublic: input.isPublic,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });

    await this.admin.audit(actorUserId, {
      action: 'plan.upserted',
      resourceType: 'plan',
      resourceId: plan.id,
      metadata: { key: input.key, limits: input.limits, features: input.features },
      requestId,
    });

    return { id: plan.id };
  }

  /**
   * يضبط سعر باقة.
   *
   * تعديل السعر **لا يمس الاشتراكات القائمة**: كل اشتراك مرتبط بصف
   * سعر، وتغيير مبلغه هنا يسري على التجديدات القادمة. رفع سعر بأثر
   * رجعي على فاتورة صادرة تغييرٌ لمستند محاسبي.
   */
  async upsertPrice(
    actorUserId: string,
    planKey: string,
    input: z.infer<typeof upsertPlanPriceSchema>,
    requestId?: string,
  ): Promise<{ id: string }> {
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });

    if (!plan) {
      throw new NotFoundException('الباقة غير موجودة');
    }

    const price = await this.prisma.planPrice.upsert({
      where: {
        planId_interval_currency: {
          planId: plan.id,
          interval: input.interval,
          currency: input.currency,
        },
      },
      create: {
        planId: plan.id,
        interval: input.interval,
        currency: input.currency,
        amountBaisa: input.amountBaisa,
        isActive: input.isActive,
      },
      update: { amountBaisa: input.amountBaisa, isActive: input.isActive },
    });

    await this.admin.audit(actorUserId, {
      action: 'plan_price.upserted',
      resourceType: 'plan_price',
      resourceId: price.id,
      metadata: {
        planKey,
        interval: input.interval,
        currency: input.currency,
        amountBaisa: input.amountBaisa,
      },
      requestId,
    });

    return { id: price.id };
  }

  // ---------------------------------------------------------------
  // أكواد الخصم
  // ---------------------------------------------------------------

  async listCoupons() {
    const coupons = await this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });

    return coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      durationCycles: coupon.durationCycles,
      maxRedemptions: coupon.maxRedemptions,
      redeemedCount: coupon.redeemedCount,
      appliesToPlanKeys: coupon.appliesToPlanKeys,
      validUntil: coupon.validUntil?.toISOString() ?? null,
      isActive: coupon.isActive,
    }));
  }

  async upsertCoupon(
    actorUserId: string,
    input: z.infer<typeof upsertCouponSchema>,
    requestId?: string,
  ): Promise<{ id: string }> {
    const coupon = await this.prisma.coupon.upsert({
      where: { code: input.code },
      create: {
        code: input.code,
        name: input.name,
        discountType: input.discountType,
        discountValue: input.discountValue,
        durationCycles: input.durationCycles ?? null,
        maxRedemptions: input.maxRedemptions ?? null,
        appliesToPlanKeys: input.appliesToPlanKeys,
        validUntil: input.validUntil ?? null,
        isActive: input.isActive,
        createdByUserId: actorUserId,
      },
      update: {
        name: input.name,
        discountType: input.discountType,
        discountValue: input.discountValue,
        durationCycles: input.durationCycles ?? null,
        maxRedemptions: input.maxRedemptions ?? null,
        appliesToPlanKeys: input.appliesToPlanKeys,
        validUntil: input.validUntil ?? null,
        isActive: input.isActive,
      },
    });

    await this.admin.audit(actorUserId, {
      action: 'coupon.upserted',
      resourceType: 'coupon',
      resourceId: coupon.id,
      metadata: { code: input.code, discountType: input.discountType },
      requestId,
    });

    return { id: coupon.id };
  }

  // ---------------------------------------------------------------
  // تقارير الإيراد والاستخدام
  // ---------------------------------------------------------------

  /**
   * تقرير الإيراد.
   *
   * ثلاث دوال مجمِّعة لا استعلام واحد على الفواتير: كل واحدة تُرجع
   * أرقاماً بلا معرّف مؤسسة، فلا يمكن اشتقاق «كم تدفع شركة س» منها
   * مهما رُكّبت.
   */
  async revenueReport(months: number) {
    const to = new Date();
    const from = new Date(to.getTime() - months * 30 * 24 * 3_600_000);

    const [totals, byMonth, subscriptions] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          currency: string;
          paid_invoices: bigint;
          paid_baisa: Prisma.Decimal;
          vat_baisa: Prisma.Decimal;
          discount_baisa: Prisma.Decimal;
        }>
      >`SELECT * FROM admin_revenue_totals(${from}::timestamptz, ${to}::timestamptz)`,
      this.prisma.$queryRaw<
        Array<{ month: Date; currency: string; paid_baisa: Prisma.Decimal }>
      >`SELECT * FROM admin_revenue_by_month(${months}::int)`,
      this.prisma.$queryRaw<
        Array<{
          plan_key: string;
          status: string;
          subscription_count: bigint;
          seats: bigint;
        }>
      >`SELECT * FROM admin_subscription_stats()`,
    ]);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: totals.map((row) => ({
        currency: row.currency,
        paidInvoices: Number(row.paid_invoices),
        paidBaisa: Number(row.paid_baisa),
        vatBaisa: Number(row.vat_baisa),
        discountBaisa: Number(row.discount_baisa),
      })),
      byMonth: byMonth.map((row) => ({
        month: row.month.toISOString().slice(0, 7),
        currency: row.currency,
        paidBaisa: Number(row.paid_baisa),
      })),
      subscriptions: subscriptions.map((row) => ({
        planKey: row.plan_key,
        status: row.status,
        count: Number(row.subscription_count),
        seats: Number(row.seats),
      })),
    };
  }

  // ---------------------------------------------------------------
  // تعليق الحسابات
  // ---------------------------------------------------------------

  /**
   * يعلّق مؤسسة.
   *
   * حجب الصفحات العامة قرار منفصل عن منع اللوحة: الأول إزالة محتوى
   * منشور مطبوع على ورق ورموز QR، والثاني إجراء تشغيلي. جمعهما في
   * مفتاح واحد كان سيجعل تأخّر سداد يُسقط بطاقات عملاء لا علاقة لهم
   * بالخلاف.
   */
  async suspend(
    actorUserId: string,
    organizationId: string,
    input: z.infer<typeof suspendOrganizationSchema>,
    requestId?: string,
  ): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, suspendedAt: true, deletedAt: true },
    });

    if (!organization || organization.deletedAt) {
      throw new NotFoundException('المؤسسة غير موجودة');
    }

    if (organization.suspendedAt) {
      throw new ConflictException('المؤسسة معلَّقة بالفعل');
    }

    const now = new Date();

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        suspendedAt: now,
        suspensionReason: input.reason,
        suspendedByUserId: actorUserId,
        publicAccessBlockedAt: input.blockPublicAccess ? now : null,
      },
    });

    // الإشعار عبر الـoutbox: التعليق يجب أن يصل إلى العميل، وإرسال
    // البريد داخل الطلب مخالف للقاعدة 3.
    await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.outboxEvent.create({
        data: {
          organizationId,
          eventType: OUTBOX_EVENT_TYPES.ORGANIZATION_SUSPENDED,
          payload: { reason: input.reason, publicBlocked: input.blockPublicAccess },
        },
      }),
    );

    await this.admin.audit(actorUserId, {
      action: 'organization.suspended',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: { reason: input.reason, blockPublicAccess: input.blockPublicAccess },
      requestId,
    });
  }

  async unsuspend(
    actorUserId: string,
    organizationId: string,
    requestId?: string,
  ): Promise<void> {
    const updated = await this.prisma.organization.updateMany({
      where: { id: organizationId, suspendedAt: { not: null } },
      data: {
        suspendedAt: null,
        suspensionReason: null,
        suspendedByUserId: null,
        publicAccessBlockedAt: null,
      },
    });

    if (updated.count === 0) {
      throw new NotFoundException('المؤسسة غير معلَّقة');
    }

    await this.admin.audit(actorUserId, {
      action: 'organization.unsuspended',
      resourceType: 'organization',
      resourceId: organizationId,
      requestId,
    });
  }

  // ---------------------------------------------------------------
  // طابور الدعم
  // ---------------------------------------------------------------

  async supportQueue(status: string | null, limit: number) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        ticket_id: string;
        organization_id: string;
        organization_slug: string;
        subject: string;
        category: string;
        priority: string;
        status: string;
        message_count: bigint;
        created_at: Date;
        updated_at: Date;
      }>
    >`SELECT * FROM admin_support_queue(${status}::text, ${limit}::int)`;

    return rows.map((row) => ({
      id: row.ticket_id,
      organizationId: row.organization_id,
      organizationSlug: row.organization_slug,
      subject: row.subject,
      category: row.category,
      priority: row.priority,
      status: row.status,
      messageCount: Number(row.message_count),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  /**
   * يقرأ رسائل تذكرة.
   *
   * الاستثناء الوحيد من القاعدة 11 في هذه الوحدة، ومسجَّل: التذكرة
   * كُتبت قاصدةً أن يقرأها فريق المنصة. القراءة نفسها تُدوَّن في سجل
   * تدقيق المنصة — من فتح تذكرة من، ومتى.
   */
  async readTicket(actorUserId: string, ticketId: string, requestId?: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        message_id: string;
        author_type: string;
        is_internal: boolean;
        body: string;
        created_at: Date;
      }>
    >`SELECT * FROM admin_ticket_messages(${ticketId}::uuid)`;

    await this.admin.audit(actorUserId, {
      action: 'support.ticket_read',
      resourceType: 'support_ticket',
      resourceId: ticketId,
      requestId,
    });

    return rows.map((row) => ({
      id: row.message_id,
      authorType: row.author_type,
      isInternal: row.is_internal,
      body: row.body,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async replyToTicket(
    actorUserId: string,
    ticketId: string,
    body: string,
    isInternal: boolean,
    requestId?: string,
  ): Promise<{ id: string }> {
    const [row] = await this.prisma.$queryRaw<
      Array<{ admin_reply_to_ticket: string }>
    >`SELECT admin_reply_to_ticket(${ticketId}::uuid, ${actorUserId}::uuid, ${body}::text, ${isInternal}::boolean)`;

    await this.admin.audit(actorUserId, {
      action: isInternal ? 'support.internal_note' : 'support.replied',
      resourceType: 'support_ticket',
      resourceId: ticketId,
      requestId,
    });

    return { id: row?.admin_reply_to_ticket ?? '' };
  }
}
