import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppConfig } from '@/config/app-config.service';
import { Public } from '@/common/auth/auth.decorators';
import { DatabaseService } from '@/database/database.service';
import { RedisHealthService } from './redis-health.service';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  time: string;
  checks: { database: 'up' | 'down'; redis: 'up' | 'down' };
}

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisHealthService,
    private readonly config: AppConfig,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([this.database.ping(), this.redis.ping()]);
    const healthy = database && redis;
    response.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: healthy ? 'ok' : 'degraded',
      version: this.config.get('APP_VERSION'),
      time: new Date().toISOString(),
      checks: { database: database ? 'up' : 'down', redis: redis ? 'up' : 'down' },
    };
  }
}
