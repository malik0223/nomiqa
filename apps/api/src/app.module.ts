import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { Auth0JwtGuard } from './auth/auth0-jwt.guard.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';
import { FilesModule } from './files/files.module.js';
import { HealthController } from './health/health.controller.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PermissionsGuard } from './tenancy/permissions.guard.js';
import { TenantContextGuard } from './tenancy/tenant-context.guard.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    PrismaModule,
    NotificationsModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    FilesModule,
  ],
  controllers: [HealthController],
  providers: [
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
