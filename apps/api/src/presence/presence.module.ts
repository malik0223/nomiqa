import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CampaignsService } from './campaigns.service.js';
import { NfcService } from './nfc.service.js';
import {
  CampaignsController,
  NfcController,
  ShareTargetsController,
} from './presence.controller.js';
import { ShareTargetsService } from './share-targets.service.js';

/**
 * أهداف المشاركة: وسوم NFC والحملات (§10.2 و§10.4).
 *
 * وحدة واحدة للاثنين لا وحدتان: كلاهما **كود قصير يترجَم إلى بطاقة**،
 * ويتشاركان فضاء الأكواد نفسه ومسار الحل العام نفسه. فصلهما كان يعني
 * مولّد أكواد في مكانين — وأول اختلاف بينهما تصادمٌ لا يظهر إلا بعد
 * طباعة الوسوم.
 *
 * **لا تعتمد على `CardsModule`**: العلاقة اتجاهها من الكود إلى البطاقة
 * لا العكس، والبطاقة لا تعرف شيئاً عن وسومها.
 */
@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [NfcController, CampaignsController, ShareTargetsController],
  providers: [NfcService, CampaignsService, ShareTargetsService],
  exports: [ShareTargetsService],
})
export class PresenceModule {}
