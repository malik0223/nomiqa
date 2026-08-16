import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { FilesModule } from '../files/files.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BrandingController } from './branding.controller.js';
import { BrandingService } from './branding.service.js';

/**
 * وحدة الهوية المؤسسية (§9.3).
 *
 * **لا تعتمد على `CardsModule`** عمداً: البطاقات هي التي تسأل عن
 * السياسة، لا العكس. سير الموافقة — وهو الطرف الذي يحتاج تعديل بطاقة
 * — يعيش في `ApprovalsModule` المستقلة، فلا تنشأ حلقة بين الوحدتين.
 */
@Module({
  imports: [PrismaModule, BillingModule, FilesModule],
  controllers: [BrandingController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
