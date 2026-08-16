import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import {
  MeetingBackgroundsController,
  SignaturesController,
} from './signatures.controller.js';
import { SignaturesService } from './signatures.service.js';

/**
 * التوقيع وخلفيات الاجتماعات (§10.3).
 *
 * وحدة واحدة لأن الاثنين **قراءة للقطة المنشورة نفسها** بصيغتين
 * مختلفتين: النص المهم واحد، والاختلاف في وسيط العرض. فصلهما كان يعني
 * نسختين من منطق «أي لغة، أي لون، أي رابط» لا مبرر لتباعدهما.
 */
@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [SignaturesController, MeetingBackgroundsController],
  providers: [SignaturesService],
})
export class SignaturesModule {}
