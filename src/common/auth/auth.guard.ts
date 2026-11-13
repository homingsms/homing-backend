import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH_MODE_KEY, type AuthMode, REQUIRED_ROLE_KEY, REQUIRED_SCOPE_KEY } from './auth.decorators';
import { API_KEY_PREFIX, DEVICE_TOKEN_PREFIX } from './constants';
import { CredentialsService } from './credentials.service';
import type { Principal } from './principal';
import { readBearer, readSessionCookie } from './request-credentials';
import { hasRole, type Role } from './roles';
import { ADMIN_SCOPE, type Scope } from './scopes';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly credentials: CredentialsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const mode = this.reflector.getAllAndOverride<AuthMode | undefined>(AUTH_MODE_KEY, targets) ?? 'principal';
    if (mode === 'public') {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const bearer = readBearer(request);

    if (mode === 'device') {
      const device = bearer?.startsWith(DEVICE_TOKEN_PREFIX)
        ? await this.credentials.resolveDevice(bearer)
        : null;
      if (!device) {
        throw new UnauthorizedException('Missing or invalid device token');
      }
      request.device = device;
      return true;
    }

    const principal = await this.resolvePrincipal(request, bearer);
    if (!principal) {
      throw new UnauthorizedException('Missing or invalid credentials');
    }
    if (mode === 'session' && principal.kind !== 'session') {
      throw new ForbiddenException('This operation needs a console session');
    }
    if (principal.kind === 'session') {
      const role = this.reflector.getAllAndOverride<Role | undefined>(REQUIRED_ROLE_KEY, targets);
      if (role && !hasRole(principal.role, role)) {
        throw new ForbiddenException(`This action needs the ${role} role or higher`);
      }
    }
    if (principal.kind === 'apiKey') {
      const scope = this.reflector.getAllAndOverride<Scope | undefined>(REQUIRED_SCOPE_KEY, targets) ?? ADMIN_SCOPE;
      if (!principal.scopes.includes(ADMIN_SCOPE) && !principal.scopes.includes(scope)) {
        throw new ForbiddenException(`This API key needs the ${scope} scope`);
      }
    }
    request.principal = principal;
    return true;
  }

  private async resolvePrincipal(request: Request, bearer: string | null): Promise<Principal | null> {
    if (bearer) {
      return bearer.startsWith(API_KEY_PREFIX) ? this.credentials.resolveApiKey(bearer) : null;
    }
    const sessionToken = readSessionCookie(request);
    return sessionToken ? this.credentials.resolveSession(sessionToken) : null;
  }
}
