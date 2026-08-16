import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApprovalsService } from './approvals.service.js';
import { BrandingModule } from './branding.module.js';

/**
 * سير الموافقة (§9.3).
 *
 * وحدة مستقلة لأنها الطرف الوحيد الذي يحتاج `CardsService` **و**
 * `BrandingService` معاً. دمجها في أيٍّ منهما كان ينشئ حلقة اعتماد
 * بين البطاقات والهوية المؤسسية.
 *
 * تطبيق الطلب الموافَق عليه يمر بـ`CardsService.update` نفسها: مسار
 * كتابة ثانٍ للبطاقة كان سيتجاوز تدقيق الإصدار وبناء اللقطة.
 */
@Module({
  imports: [PrismaModule, BrandingModule, CardsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
})
export class ApprovalsModule {}
