import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(7010),
  APP_VERSION: z.string().default('1.0.0'),
  TRUST_PROXY: bool.default(false),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  REDIS_URL: z.string().url(),
  QUEUE_PREFIX: z.string().min(1).default('homing'),
  CORS_ORIGINS: csv.default([]),
  PUBLIC_API_URL: z.string().url().default('http://localhost:7010'),
  SECRET_PEPPER: z.string().min(32),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 32 bytes as 64 hex characters'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECURE: bool.optional(),
  BODY_LIMIT: z.string().default('2mb'),
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(300),
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),
  PAIRING_CODE_TTL_SECONDS: z.coerce.number().int().min(60).default(600),
  LEASE_SECONDS: z.coerce.number().int().min(10).default(120),
  MAX_LEASE_ATTEMPTS: z.coerce.number().int().min(1).default(3),
  HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),
  PULL_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(300),
  OFFLINE_AFTER_SECONDS: z.coerce.number().int().min(30).default(180),
  MAINTENANCE_INTERVAL_MS: z.coerce.number().int().min(0).default(5000),
  OPT_OUT_KEYWORDS: csv.default(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']),
  WEBHOOK_WORKER_ENABLED: bool.default(true),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
  WEBHOOK_BACKOFF_MS: z.coerce.number().int().min(10).default(60000),
  WEBHOOK_ALLOW_HTTP: bool.default(false),
  WEBHOOK_ALLOW_PRIVATE_TARGETS: bool.default(false),
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().optional(),
  OPENAPI_SPEC_PATH: z.string().default('packages/contracts/openapi/public.yaml'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, unknown>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== ''),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}
