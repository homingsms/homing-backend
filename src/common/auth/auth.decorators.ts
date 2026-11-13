import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { DevicePrincipal, Principal, SessionPrincipal } from './principal';
import type { Role } from './roles';
import type { Scope } from './scopes';

export type AuthMode = 'public' | 'device' | 'session' | 'principal';

export const AUTH_MODE_KEY = 'homing:auth-mode';
export const REQUIRED_SCOPE_KEY = 'homing:required-scope';
export const REQUIRED_ROLE_KEY = 'homing:required-role';

export const Public = () => SetMetadata(AUTH_MODE_KEY, 'public' satisfies AuthMode);
export const DeviceAuth = () => SetMetadata(AUTH_MODE_KEY, 'device' satisfies AuthMode);
export const SessionOnly = () => SetMetadata(AUTH_MODE_KEY, 'session' satisfies AuthMode);
export const RequireScope = (scope: Scope) => SetMetadata(REQUIRED_SCOPE_KEY, scope);
export const RequireRole = (role: Role) => SetMetadata(REQUIRED_ROLE_KEY, role);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal = context.switchToHttp().getRequest<Request>().principal;
    if (!principal) {
      throw new UnauthorizedException();
    }
    return principal;
  },
);

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionPrincipal => {
    const principal = context.switchToHttp().getRequest<Request>().principal;
    if (principal?.kind !== 'session') {
      throw new UnauthorizedException();
    }
    return principal;
  },
);

export const CurrentDevice = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DevicePrincipal => {
    const device = context.switchToHttp().getRequest<Request>().device;
    if (!device) {
      throw new UnauthorizedException();
    }
    return device;
  },
);
