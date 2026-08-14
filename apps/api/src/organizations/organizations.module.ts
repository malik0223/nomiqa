import { Module } from '@nestjs/common';
import { OrganizationProvisioningService } from './organization-provisioning.service.js';

@Module({
  providers: [OrganizationProvisioningService],
  exports: [OrganizationProvisioningService],
})
export class OrganizationsModule {}
