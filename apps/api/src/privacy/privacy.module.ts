import { Module } from '@nestjs/common';
import { Auth0ManagementService } from '../auth/auth0-management.service.js';
import { AccountService } from './account.service.js';
import { ConsentsService } from './consents.service.js';
import { PrivacyController } from './privacy.controller.js';

@Module({
  controllers: [PrivacyController],
  providers: [ConsentsService, AccountService, Auth0ManagementService],
  exports: [ConsentsService],
})
export class PrivacyModule {}
