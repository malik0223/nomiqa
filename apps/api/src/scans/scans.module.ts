import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { FilesModule } from '../files/files.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ScansController } from './scans.controller.js';
import { ScansService } from './scans.service.js';

/**
 * المسح والاستخراج (§11.2).
 *
 * يعتمد على `FilesModule` لا على التخزين مباشرةً: حذف صورة المسح يجب
 * أن يمر بنفس المسار الذي يحذف به أي ملف — سجل ملف موسوم محذوفاً ثم
 * حذف الكائن، فلا تبقى صورة يتيمة في الدلو لا يعرف عنها أحد.
 *
 * ولا يعتمد على `EventsModule`: ما يحتاجه من الفعاليات هو قارئ تعريف
 * حقول التأهيل، وهو دالة نقية تُستورد مباشرة. اعتماد وحدة كاملة لأجل
 * دالة يربط إقلاع المسح بإقلاع الفعاليات بلا سبب.
 */
@Module({
  imports: [PrismaModule, BillingModule, FilesModule],
  controllers: [ScansController],
  providers: [ScansService],
})
export class ScansModule {}
