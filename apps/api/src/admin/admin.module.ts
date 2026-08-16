import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';
import { AdminBillingController } from './admin-billing.controller.js';
import { AdminBillingService } from './admin-billing.service.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

@Module({
  imports: [FeatureFlagsModule],
  controllers: [AdminController, AdminBillingController],
  providers: [AdminService, AdminBillingService, PlatformAdminGuard],
})
export class AdminModule {}
