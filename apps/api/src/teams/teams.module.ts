import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { DirectoryService } from './directory.service.js';
import { EmployeeImportService } from './employee-import.service.js';
import {
  DirectoryController,
  InvitationAcceptanceController,
  InvitationsController,
} from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { MembersService } from './members.service.js';
import { TeamsController } from './teams.controller.js';
import { UnitsService } from './units.service.js';

/**
 * وحدة الفرق (خارطة الطريق §9.2).
 *
 * تعتمد على `BillingModule` لأن كل ما هنا محكوم بحدّ باقة: عدد
 * الأعضاء، عدد الإدارات والفروع، وإتاحة الاستيراد والدليل أصلاً.
 */
@Module({
  imports: [PrismaModule, RedisModule, BillingModule],
  controllers: [
    TeamsController,
    InvitationsController,
    InvitationAcceptanceController,
    DirectoryController,
  ],
  providers: [
    UnitsService,
    MembersService,
    InvitationsService,
    DirectoryService,
    EmployeeImportService,
  ],
  exports: [UnitsService, InvitationsService],
})
export class TeamsModule {}
