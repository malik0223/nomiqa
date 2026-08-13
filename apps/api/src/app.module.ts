import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Auth0JwtGuard } from './auth/auth0-jwt.guard.js';
import { UserProvisioningService } from './auth/user-provisioning.service.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PermissionsGuard } from './tenancy/permissions.guard.js';
import { TenantContextGuard } from './tenancy/tenant-context.guard.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true }), PrismaModule],
  controllers: [HealthController],
  providers: [
    UserProvisioningService,
    // ترتيب الحرّاس مقصود: هوية → مؤسسة → صلاحية.
    { provide: APP_GUARD, useClass: Auth0JwtGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
