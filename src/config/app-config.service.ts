import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

export const DEV_CORS_ORIGINS = ['http://localhost:7011'] as const;

@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get cookieSecure(): boolean {
    return this.get('COOKIE_SECURE') ?? this.isProduction;
  }

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS') ?? (this.get('NODE_ENV') === 'development' ? [...DEV_CORS_ORIGINS] : []);
  }

  get staleHeartbeatSeconds(): number {
    return this.get('STALE_HEARTBEAT_SECONDS') ?? this.get('HEARTBEAT_INTERVAL_SECONDS') * 2;
  }

  get throttlePrefix(): string {
    return `${this.get('QUEUE_PREFIX')}:throttle`;
  }
}
