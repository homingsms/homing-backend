import { Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { SESSION_COOKIE_NAME } from '@/common/auth/constants';
import { AppConfig } from '@/config/app-config.service';
import type { IssuedSession } from './sessions.service';

@Injectable()
export class SessionCookie {
  constructor(private readonly config: AppConfig) {}

  set(response: Response, issued: IssuedSession): void {
    response.cookie(SESSION_COOKIE_NAME, issued.token, { ...this.options(), expires: issued.expiresAt });
  }

  clear(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, this.options());
  }

  private options(): CookieOptions {
    return { httpOnly: true, secure: this.config.cookieSecure, sameSite: 'lax', path: '/' };
  }
}
