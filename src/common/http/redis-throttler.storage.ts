import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';
import { redisOptionsFromUrl } from '@/common/redis';
import { AppConfig } from '@/config/app-config.service';

export interface ThrottleRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const INCREMENT_SCRIPT = `
local hits_key = KEYS[1]
local block_key = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local block = tonumber(ARGV[3])
local block_left = redis.call('PTTL', block_key)
if block_left > 0 then
  local hits = tonumber(redis.call('GET', hits_key) or '0')
  local hits_left = redis.call('PTTL', hits_key)
  return {hits, hits_left, 1, block_left}
end
local hits = redis.call('INCR', hits_key)
local hits_left = redis.call('PTTL', hits_key)
if hits_left < 0 then
  redis.call('PEXPIRE', hits_key, ttl)
  hits_left = ttl
end
if hits > limit then
  redis.call('SET', block_key, '1', 'PX', block)
  return {hits, hits_left, 1, block}
end
return {hits, hits_left, 0, 0}
`;

function toSeconds(milliseconds: number): number {
  return Math.max(0, Math.ceil(milliseconds / 1000));
}

function readReply(reply: unknown): [number, number, number, number] {
  if (!Array.isArray(reply) || reply.length !== 4 || !reply.every((value) => typeof value === 'number')) {
    throw new Error('Unexpected rate limit reply from Redis');
  }
  return reply as [number, number, number, number];
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly client: Redis;
  private readonly prefix: string;

  constructor(config: AppConfig) {
    this.client = new Redis({ ...redisOptionsFromUrl(config.get('REDIS_URL')), maxRetriesPerRequest: 2 });
    this.client.on('error', () => undefined);
    this.prefix = config.throttlePrefix;
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottleRecord> {
    const base = `${this.prefix}:${throttlerName}:${key}`;
    const reply = await this.client.eval(INCREMENT_SCRIPT, 2, `${base}:hits`, `${base}:block`, ttl, limit, blockDuration);
    const [totalHits, hitsLeft, blocked, blockLeft] = readReply(reply);
    return {
      totalHits,
      timeToExpire: toSeconds(hitsLeft),
      isBlocked: blocked === 1,
      timeToBlockExpire: toSeconds(blockLeft),
    };
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
