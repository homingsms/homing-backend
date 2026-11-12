import { Logger } from '@nestjs/common';
import { resolve } from 'node:path';
import { parseEnv } from '@/config/env.schema';
import { runMigrations } from './run-migrations';

async function main(): Promise<void> {
  const env = parseEnv(process.env);
  await runMigrations(env.DATABASE_URL, resolve(process.cwd(), 'drizzle'));
  new Logger('Migrations').log('Database is up to date');
}

main().catch((error: unknown) => {
  new Logger('Migrations').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
