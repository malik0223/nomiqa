import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { AdminModule } from './admin/admin.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuthModule } from './auth/auth.module.js';
import { Auth0JwtGuard } from './auth/auth0-jwt.guard.js';
import { BillingModule } from './billing/billing.module.js';
import { ApprovalsModule } from './branding/approvals.module.js';
import { BrandingModule } from './branding/branding.module.js';
import { CardsModule } from './cards/cards.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';
import { ContactsModule } from './contacts/contacts.module.js';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';
import { FilesModule } from './files/files.module.js';
import { HealthController } from './health/health.controller.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PresenceModule } from './presence/presence.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrivacyModule } from './privacy/privacy.module.js';
import { RedisModule } from './redis/redis.module.js';
import { SignaturesModule } from './signatures/signatures.module.js';
import { SupportModule } from './support/support.module.js';
import { TeamsModule } from './teams/teams.module.js';
import { PermissionsGuard } from './tenancy/permissions.guard.js';
import { SuspensionGuard } from './tenancy/suspension.guard.js';
import { TenantContextGuard } from './tenancy/tenant-context.guard.js';
import { UsersModule } from './users/users.module.js';
import { WalletsModule } from './wallets/wallets.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    SentryModule.forRoot(),
    RedisModule,
    PrismaModule,
    FeatureFlagsModule,
    NotificationsModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    FilesModule,
    BillingModule,
    BrandingModule,
    CardsModule,
    ApprovalsModule,
    TeamsModule,
    ContactsModule,
    AnalyticsModule,
    PresenceModule,
    SignaturesModule,
    WalletsModule,
    PrivacyModule,
    SupportModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // الترتيب مقصود: حد المعدل **أولاً**، ثم هوية → مؤسسة → صلاحية.
    //
    // الحرّاس في NestJS تعمل بترتيب التسجيل، وأول رفض يقصّر البقية.
    // وضع حد المعدل بعد المصادقة يعني أن الطلبات المجهولة لا تُحاسَب
    // إطلاقاً — وهي بالضبط ناقل الإساءة الأهم: التخمين والكشط
    // والإغراق على المسارات العامة.
    //
    // الأثر: المحاسبة بالعنوان لا بالمستخدم، لأن الهوية لم تُحلّ بعد.
    // حدٌّ لكل مستخدم يحتاج حارساً ثانياً بعد المصادقة، ويُضاف عند
    // ظهور شكوى فعلية من مؤسسات تتشارك عنواناً واحداً.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: Auth0JwtGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // التعليق آخر الترتيب: من لا يملك الصلاحية أصلاً يُرفض قبله، فلا
    // تكشف رسالة «الحساب معلَّق» حالة مؤسسة لغريب عنها.
    { provide: APP_GUARD, useClass: SuspensionGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
