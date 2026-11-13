import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import type { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { redisOptionsFromUrl } from '@/common/redis';
import { AppConfig } from '@/config/app-config.service';
import type { Env } from '@/config/env.schema';
import { DatabaseService } from '@/database/database.service';
import { MaintenanceService } from '@/maintenance/maintenance.service';
import { WEBHOOK_QUEUE } from '@/webhooks/domain/event-types';
import type { DnsResolver } from '@/webhooks/domain/url-policy';
import { WebhookOutboxDispatcher } from '@/webhooks/webhook-outbox.dispatcher';
import { WEBHOOK_DNS_RESOLVER } from '@/webhooks/webhook-sender';

export interface TestContext {
  app: NestExpressApplication;
  http: App;
  database: DatabaseService;
  maintenance: MaintenanceService;
  outbox: WebhookOutboxDispatcher;
  close: () => Promise<void>;
}

export interface TestAppOptions {
  config?: Partial<Env>;
  resolver?: DnsResolver;
  reset?: boolean;
}

class OverriddenConfig extends AppConfig {
  constructor(
    config: ConfigService<Env, true>,
    private readonly overrides: Partial<Env>,
  ) {
    super(config);
  }

  override get<K extends keyof Env>(key: K): Env[K] {
    return key in this.overrides ? (this.overrides[key] as Env[K]) : super.get(key);
  }
}

export async function deleteRedisKeys(url: string, pattern: string): Promise<void> {
  const client = new Redis(redisOptionsFromUrl(url));
  try {
    let cursor = '0';
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');
  } finally {
    await client.quit();
  }
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestContext> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.config) {
    const overrides = options.config;
    builder = builder.overrideProvider(AppConfig).useFactory({
      factory: (config: ConfigService<Env, true>) => new OverriddenConfig(config, overrides),
      inject: [ConfigService],
    });
  }
  if (options.resolver) {
    builder = builder.overrideProvider(WEBHOOK_DNS_RESOLVER).useValue(options.resolver);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
  configureApp(app);
  await app.init();
  const database = app.get(DatabaseService);
  if (options.reset !== false) {
    await resetDatabase(database);
  }
  return {
    app,
    http: app.getHttpServer() as App,
    database,
    maintenance: app.get(MaintenanceService),
    outbox: app.get(WebhookOutboxDispatcher),
    close: async () => {
      const config = app.get(AppConfig);
      await app.close();
      const queue = new Queue(WEBHOOK_QUEUE, {
        connection: redisOptionsFromUrl(config.get('REDIS_URL')),
        prefix: config.get('QUEUE_PREFIX'),
      });
      await queue.obliterate({ force: true });
      await queue.close();
      await deleteRedisKeys(config.get('REDIS_URL'), `${config.throttlePrefix}:*`);
    },
  };
}

export async function resetDatabase(database: DatabaseService): Promise<void> {
  await database.db.execute(sql`truncate table accounts, users cascade`);
}
