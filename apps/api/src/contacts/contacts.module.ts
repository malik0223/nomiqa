import { Module } from '@nestjs/common';
import { ContactCaptureService } from './contact-capture.service.js';
import { ContactsController, TagsController } from './contacts.controller.js';
import { ContactsService } from './contacts.service.js';
import { PublicContactsController } from './public-contacts.controller.js';

@Module({
  controllers: [ContactsController, TagsController, PublicContactsController],
  providers: [ContactsService, ContactCaptureService],
  exports: [ContactsService],
})
export class ContactsModule {}
