import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { UserProvisioningService } from './user-provisioning.service.js';

/**
 * يُصدّر UserProvisioningService لأن Auth0JwtGuard مسجّل كـAPP_GUARD
 * في AppModule ويحتاج حله من هناك.
 */
@Module({
  imports: [OrganizationsModule],
  providers: [UserProvisioningService],
  exports: [UserProvisioningService],
})
export class AuthModule {}
