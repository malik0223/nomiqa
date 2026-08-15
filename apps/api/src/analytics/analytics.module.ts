import { Module } from '@nestjs/common';
import { AnalyticsIngestService } from './analytics-ingest.service.js';
import { AnalyticsController, PublicAnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

@Module({
  controllers: [AnalyticsController, PublicAnalyticsController],
  providers: [AnalyticsService, AnalyticsIngestService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
