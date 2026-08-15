import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthStatus } from '@nomiqa/contracts';
import { Public } from '../auth/public.decorator.js';
import { SkipRateLimit } from '../common/rate-limit.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * مسارات الصحة خارج نظام الإصدارات عمداً: يستدعيها موازن الحمل ومنصة
 * الحاويات، ويجب أن يبقى عنوانها ثابتاً عبر إصدارات الـAPI.
 */
@ApiTags('health')
@SkipRateLimit()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** فحص حيوية سريع لموازن الحمل — لا يلمس أي اعتمادية خارجية. */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** فحص جاهزية — يتحقق من الاعتماديات قبل استقبال حركة حقيقية. */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  async ready(): Promise<HealthStatus> {
    const checks: HealthStatus['checks'] = {};

    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch (error) {
      checks.database = { status: 'error', message: (error as Error).message };
    }

    const healthy = Object.values(checks).every((check) => check.status === 'ok');

    return {
      status: healthy ? 'ok' : 'error',
      version: process.env.APP_VERSION ?? '0.1.0',
      checks,
    };
  }
}
