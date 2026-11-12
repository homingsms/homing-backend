import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { AppConfig } from '@/config/app-config.service';
import type { Database } from './database.types';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client: Sql;
  readonly db: Database;

  constructor(config: AppConfig) {
    this.client = postgres(config.get('DATABASE_URL'), {
      max: config.get('DATABASE_POOL_MAX'),
      onnotice: () => undefined,
    });
    this.db = drizzle(this.client, { schema });
  }

  async ping(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
