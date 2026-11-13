import type { ConfigService } from '@nestjs/config';
import { AppConfig } from './app-config.service';
import { type Env, parseEnv } from './env.schema';

const base = {
  DATABASE_URL: 'postgres://localhost:5432/homing_test',
  REDIS_URL: 'redis://localhost:6379/12',
  SECRET_PEPPER: 'test-pepper-test-pepper-test-pepper-0001',
  ENCRYPTION_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
};

function configFor(raw: Record<string, string>): AppConfig {
  const env = parseEnv({ ...base, ...raw });
  const service = { get: <K extends keyof Env>(key: K) => env[key] } as unknown as ConfigService<Env, true>;
  return new AppConfig(service);
}

describe('AppConfig', () => {
  it('allows the local console origin by default in development only', () => {
    expect(configFor({ NODE_ENV: 'development' }).corsOrigins).toEqual(['http://localhost:7011']);
    expect(configFor({ NODE_ENV: 'production' }).corsOrigins).toEqual([]);
    expect(configFor({ NODE_ENV: 'test' }).corsOrigins).toEqual([]);
  });

  it('uses configured origins as given', () => {
    expect(configFor({ NODE_ENV: 'development', CORS_ORIGINS: 'https://console.example, https://admin.example' }).corsOrigins).toEqual([
      'https://console.example',
      'https://admin.example',
    ]);
    expect(configFor({ NODE_ENV: 'development', CORS_ORIGINS: '' }).corsOrigins).toEqual(['http://localhost:7011']);
  });

  it('treats a heartbeat as stale after two intervals unless configured', () => {
    expect(configFor({ HEARTBEAT_INTERVAL_SECONDS: '45' }).staleHeartbeatSeconds).toBe(90);
    expect(configFor({ STALE_HEARTBEAT_SECONDS: '300' }).staleHeartbeatSeconds).toBe(300);
  });

  it('keeps rate limit keys under the queue prefix', () => {
    expect(configFor({ QUEUE_PREFIX: 'homing-x' }).throttlePrefix).toBe('homing-x:throttle');
  });
});
