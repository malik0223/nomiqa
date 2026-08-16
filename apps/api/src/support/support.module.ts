import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
