const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://homing:homing@localhost:54329/homing_test',
  REDIS_URL: 'redis://localhost:63799/1',
  QUEUE_PREFIX: 'homing-test',
  CORS_ORIGINS: 'http://localhost:3000',
  PUBLIC_API_URL: 'http://localhost:7010',
  SECRET_PEPPER: 'test-pepper-test-pepper-test-pepper-0001',
  ENCRYPTION_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  BCRYPT_ROUNDS: '4',
  COOKIE_SECURE: 'false',
  BODY_LIMIT: '2mb',
  THROTTLE_LIMIT: '100000',
  AUTH_THROTTLE_LIMIT: '100000',
  MAINTENANCE_INTERVAL_MS: '0',
  LEASE_SECONDS: '60',
  MAX_LEASE_ATTEMPTS: '2',
  OFFLINE_AFTER_SECONDS: '180',
  WEBHOOK_WORKER_ENABLED: 'true',
  WEBHOOK_ALLOW_HTTP: 'true',
  WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true',
  WEBHOOK_MAX_ATTEMPTS: '3',
  WEBHOOK_BACKOFF_MS: '100',
  WEBHOOK_TIMEOUT_MS: '2000',
  FIREBASE_SERVICE_ACCOUNT_BASE64: '',
};

export function applyTestEnv(): void {
  for (const [key, value] of Object.entries(defaults)) {
    if (process.env[key] === undefined || key === 'NODE_ENV') {
      process.env[key] = value;
    }
  }
}
