import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '@/config/app-config.service';
import { redisOptionsFromUrl } from '@/common/redis';

const PING_TIMEOUT_MS = 2000;

@Injectable()
export class RedisHealthService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: AppConfig) {
    this.client = new Redis({
      ...redisOptionsFromUrl(config.get('REDIS_URL')),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: PING_TIMEOUT_MS,
      enableOfflineQueue: false,
    });
    this.client.on('error', () => undefined);
  }

  async ping(): Promise<boolean> {
    try {
      if (this.client.status === 'wait' || this.client.status === 'end') {
        await this.client.connect();
      }
      const timeout = new Promise<string>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Redis ping timed out')), PING_TIMEOUT_MS).unref(),
      );
      return (await Promise.race([this.client.ping(), timeout])) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end' && this.client.status !== 'wait') {
      await this.client.quit().catch(() => undefined);
    } else {
      this.client.disconnect();
    }
  }
}
