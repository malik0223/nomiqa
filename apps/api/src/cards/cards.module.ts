import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { CardsController } from './cards.controller.js';
import { CardsService } from './cards.service.js';
import { PublicCardsController } from './public-cards.controller.js';

@Module({
  // FilesModule يصدّر StorageService: نشر البطاقة ينسخ وسائطها إلى
  // الدلو العام، فيمر التعامل مع التخزين من الغلاف نفسه لا من عميل ثانٍ.
  imports: [FilesModule],
  controllers: [CardsController, PublicCardsController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}
