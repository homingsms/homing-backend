import { resolve } from 'node:path';
import { runMigrations } from '../../src/database/run-migrations';
import { applyTestEnv } from './test-env';

export default async function globalSetup(): Promise<void> {
  applyTestEnv();
  await runMigrations(process.env.DATABASE_URL ?? '', resolve(__dirname, '../../drizzle'));
}
