import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventReportService } from './event-report.service.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

/**
 * الفعاليات (§11.3).
 *
 * تُصدِّر `EventsService` لأن وحدة المسح تحتاج تعريف حقول التأهيل قبل
 * حفظ جهة اتصال — والتحقق من القيم يجب أن يقع على التعريف نفسه الذي
 * عرضته الشاشة، لا على نسخة ثانية منه.
 */
@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [EventsController],
  providers: [EventsService, EventReportService],
  exports: [EventsService],
})
export class EventsModule {}
