import { type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

const RETRY_AFTER_HEADER = 'Retry-After';

export const STRICT_THROTTLE_KEY = 'homing:strict-throttle';
export const StrictThrottle = () => SetMetadata(STRICT_THROTTLE_KEY, true);

export function isStrictThrottled(context: ExecutionContext): boolean {
  const value: unknown = Reflect.getMetadata(STRICT_THROTTLE_KEY, context.getHandler());
  return value === true;
}

@Injectable()
export class HomingThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(request: Request): Promise<string> {
    if (request.principal) {
      return Promise.resolve(`account:${request.principal.accountId}`);
    }
    if (request.device) {
      return Promise.resolve(`device:${request.device.id}`);
    }
    return Promise.resolve(`ip:${request.ip ?? 'unknown'}`);
  }

  protected override setResponseHeader(response: Record<string, unknown>, name: string, value: string | number): void {
    super.setResponseHeader(response, name, value);
    if (name.startsWith(`${RETRY_AFTER_HEADER}-`)) {
      super.setResponseHeader(response, RETRY_AFTER_HEADER, value);
    }
  }
}
