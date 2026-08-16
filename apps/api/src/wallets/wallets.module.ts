import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WalletsController } from './wallets.controller.js';
import { WalletsService } from './wallets.service.js';

/**
 * المحافظ الرقمية (§10.2).
 *
 * القرار وأسبابه في `docs/adr/ADR-015-wallet-passes.md`.
 */
@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [WalletsController],
  providers: [WalletsService],
})
export class WalletsModule {}
