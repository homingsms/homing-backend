import { BullModule } from '@nestjs/bullmq';
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { AccountsModule } from '@/accounts/accounts.module';
import { ApiKeysModule } from '@/api-keys/api-keys.module';
import { AuthCoreModule } from '@/common/auth/auth-core.module';
import { AuthGuard } from '@/common/auth/auth.guard';
import { RequestLoggerMiddleware } from '@/common/http/request-logger.middleware';
import { HomingThrottlerGuard, isStrictThrottled } from '@/common/http/throttling';
import { redisOptionsFromUrl } from '@/common/redis';
import { AppConfigModule } from '@/config/app-config.module';
import { AppConfig } from '@/config/app-config.service';
import { DatabaseModule } from '@/database/database.module';
import { DevicesModule } from '@/devices/devices.module';
import { DocsModule } from '@/docs/docs.module';
import { HealthModule } from '@/health/health.module';
import { InboxModule } from '@/inbox/inbox.module';
import { LeasesModule } from '@/leases/leases.module';
import { MaintenanceModule } from '@/maintenance/maintenance.module';
import { MessagesModule } from '@/messages/messages.module';
import { PushModule } from '@/push/push.module';
import { UsageModule } from '@/usage/usage.module';
import { WebhooksModule } from '@/webhooks/webhooks.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuthCoreModule,
    PushModule,
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        connection: redisOptionsFromUrl(config.get('REDIS_URL')),
        prefix: config.get('QUEUE_PREFIX'),
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          {
            name: 'default',
            ttl: seconds(config.get('THROTTLE_TTL_SECONDS')),
            limit: config.get('THROTTLE_LIMIT'),
          },
          {
            name: 'auth',
            ttl: seconds(config.get('THROTTLE_TTL_SECONDS')),
            limit: config.get('AUTH_THROTTLE_LIMIT'),
            skipIf: (context) => !isStrictThrottled(context),
          },
        ],
      }),
    }),
    AccountsModule,
    ApiKeysModule,
    DevicesModule,
    MessagesModule,
    LeasesModule,
    InboxModule,
    WebhooksModule,
    UsageModule,
    HealthModule,
    DocsModule,
    MaintenanceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: HomingThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*splat');
  }
}
