import { Module } from '@nestjs/common';
import { Auth0ManagementService } from '../auth/auth0-management.service.js';
import { AccountService } from './account.service.js';
import { ConsentsService } from './consents.service.js';
import { PrivacyController } from './privacy.controller.js';
import { ProfileService } from './profile.service.js';

@Module({
  controllers: [PrivacyController],
  providers: [ConsentsService, AccountService, Auth0ManagementService, ProfileService],
  exports: [ConsentsService, ProfileService],
})
export class PrivacyModule {}
