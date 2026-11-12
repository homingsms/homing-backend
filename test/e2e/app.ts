import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { sql } from 'drizzle-orm';
import type { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { redisOptionsFromUrl } from '@/common/redis';
import { AppConfig } from '@/config/app-config.service';
import { DatabaseService } from '@/database/database.service';
import { MaintenanceService } from '@/maintenance/maintenance.service';
import { WEBHOOK_QUEUE } from '@/webhooks/domain/event-types';

export interface TestContext {
  app: NestExpressApplication;
  http: App;
  database: DatabaseService;
  maintenance: MaintenanceService;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
  configureApp(app);
  await app.init();
  const database = app.get(DatabaseService);
  await resetDatabase(database);
  return {
    app,
    http: app.getHttpServer() as App,
    database,
    maintenance: app.get(MaintenanceService),
    close: async () => {
      const config = app.get(AppConfig);
      await app.close();
      const queue = new Queue(WEBHOOK_QUEUE, {
        connection: redisOptionsFromUrl(config.get('REDIS_URL')),
        prefix: config.get('QUEUE_PREFIX'),
      });
      await queue.obliterate({ force: true });
      await queue.close();
    },
  };
}

export async function resetDatabase(database: DatabaseService): Promise<void> {
  await database.db.execute(sql`truncate table accounts cascade`);
}
