import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

function describeCaller(request: Request): string {
  if (request.principal) {
    return `${request.principal.kind}:${request.principal.accountId}`;
  }
  if (request.device) {
    return `device:${request.device.id}`;
  }
  return 'anonymous';
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const started = process.hrtime.bigint();
    response.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      const path = request.originalUrl.split('?')[0] ?? '';
      this.logger.log(
        `${request.method} ${path} ${response.statusCode} ${elapsedMs.toFixed(1)}ms ${describeCaller(request)}`,
      );
    });
    next();
  }
}
