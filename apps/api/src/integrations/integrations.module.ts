import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ApiKeysService } from './api-keys.service.js';
import { CrmService } from './crm.service.js';
import { IntegrationsController } from './integrations.controller.js';
import { PublicApiController } from './public-api.controller.js';
import { PublicApiService } from './public-api.service.js';
import { WebhooksService } from './webhooks.service.js';

/**
 * التكاملات (§11.4 و§11.5).
 *
 * وحدة واحدة لثلاثة موارد تبدو منفصلة — مفتاح، وجهة، وصلة — لأنها
 * إجابة واحدة على سؤال واحد: **كيف تغادر بيانات المؤسسة إلى نظام
 * آخر؟** فصلها كان يعني ثلاث شاشات وثلاث صلاحيات لقرار أمني واحد.
 *
 * التسليم الفعلي ليس هنا: الـWorker يرسل وينفّذ إعادة المحاولة. الـAPI
 * يكتب الصفوف ويقرأ حالتها — نداء صادر داخل طلب مستخدم يعني شاشةً
 * تنتظر نظاماً بطيئاً لا نملكه.
 */
@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [IntegrationsController, PublicApiController],
  providers: [ApiKeysService, WebhooksService, CrmService, PublicApiService],
})
export class IntegrationsModule {}
