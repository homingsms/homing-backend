import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppConfig } from '@/config/app-config.service';
import { CurrentSession, Public, SessionOnly } from '@/common/auth/auth.decorators';
import { SESSION_COOKIE_NAME } from '@/common/auth/constants';
import type { SessionPrincipal } from '@/common/auth/principal';
import { StrictThrottle } from '@/common/http/throttling';
import { AccountsService } from './accounts.service';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import type { SessionResponse } from './entities/account.entity';
import type { IssuedSession } from './sessions.service';
import { SessionsService } from './sessions.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @StrictThrottle()
  @Post('sign-up')
  async signUp(@Body() dto: SignUpDto, @Res({ passthrough: true }) response: Response): Promise<SessionResponse> {
    const result = await this.accounts.signUp(dto);
    this.setCookie(response, result.issued);
    return result.session;
  }

  @Public()
  @StrictThrottle()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  async signIn(@Body() dto: SignInDto, @Res({ passthrough: true }) response: Response): Promise<SessionResponse> {
    const result = await this.accounts.signIn(dto);
    this.setCookie(response, result.issued);
    return result.session;
  }

  @SessionOnly()
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@CurrentSession() session: SessionPrincipal, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.sessions.revoke(session.sessionId);
    response.clearCookie(SESSION_COOKIE_NAME, this.cookieOptions());
  }

  @SessionOnly()
  @Get('me')
  me(@CurrentSession() session: SessionPrincipal): Promise<SessionResponse> {
    return this.accounts.describeSession(session.userId);
  }

  private setCookie(response: Response, issued: IssuedSession): void {
    response.cookie(SESSION_COOKIE_NAME, issued.token, {
      ...this.cookieOptions(),
      expires: issued.expiresAt,
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'lax' as const,
      path: '/',
    };
  }
}
