import type { Request } from 'express';
import { SESSION_COOKIE_NAME } from './constants';

export function readBearer(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

export function readSessionCookie(request: Request): string | null {
  const cookies: unknown = request.cookies;
  if (typeof cookies !== 'object' || cookies === null) {
    return null;
  }
  const value: unknown = (cookies as Record<string, unknown>)[SESSION_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
