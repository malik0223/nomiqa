import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { BrandingModule } from '../branding/branding.module.js';
import { FilesModule } from '../files/files.module.js';
import { CardsController } from './cards.controller.js';
import { CardsService } from './cards.service.js';
import { PublicCardsController } from './public-cards.controller.js';

@Module({
  // FilesModule يصدّر StorageService: نشر البطاقة ينسخ وسائطها إلى
  // الدلو العام، فيمر التعامل مع التخزين من الغلاف نفسه لا من عميل ثانٍ.
  //
  // BillingModule يصدّر محرك الحصص: حد البطاقات يُقرأ من الاشتراك
  // منذ المرحلة الرابعة، ولا شرط باقة مكتوب هنا.
  //
  // BrandingModule يصدّر حلّ السياسة: التعديل يُفحص أمام الحقول
  // المقفلة قبل أن يُكتب (§9.3).
  imports: [FilesModule, BillingModule, BrandingModule],
  controllers: [CardsController, PublicCardsController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}
