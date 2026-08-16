import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BillingController } from './billing.controller.js';
import { BillingWebhookController } from './billing-webhook.controller.js';
import { EntitlementsService } from './entitlements.service.js';
import { InvoicesService } from './invoices.service.js';
import { PublicPlansController } from './public-plans.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { ThawaniProvider } from './providers/thawani.provider.js';

/**
 * وحدة الفوترة.
 *
 * `EntitlementsService` مُصدَّرة لأن كل وحدة أخرى تسألها عن حد أو ميزة
 * — البطاقات وجهات الاتصال والفرق والهوية المؤسسية. هي واجهة الباقات
 * الوحيدة، ولا تُقرأ جداول الاشتراك من خارج هذه الوحدة.
 */
@Module({
  imports: [PrismaModule],
  controllers: [BillingController, BillingWebhookController, PublicPlansController],
  providers: [EntitlementsService, SubscriptionsService, InvoicesService, ThawaniProvider],
  exports: [EntitlementsService, SubscriptionsService, InvoicesService],
})
export class BillingModule {}
