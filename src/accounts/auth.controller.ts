import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentSession, Public, SessionOnly } from '@/common/auth/auth.decorators';
import type { SessionPrincipal } from '@/common/auth/principal';
import { StrictThrottle } from '@/common/http/throttling';
import { AccountsService } from './accounts.service';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { SwitchAccountDto } from './dto/switch-account.dto';
import type { SessionResponse } from './entities/account.entity';
import { SessionCookie } from './session-cookie';
import { SessionsService } from './sessions.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
    private readonly cookie: SessionCookie,
  ) {}

  @Public()
  @StrictThrottle()
  @Post('sign-up')
  async signUp(@Body() dto: SignUpDto, @Res({ passthrough: true }) response: Response): Promise<SessionResponse> {
    const result = await this.accounts.signUp(dto);
    this.cookie.set(response, result.issued);
    return result.session;
  }

  @Public()
  @StrictThrottle()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  async signIn(@Body() dto: SignInDto, @Res({ passthrough: true }) response: Response): Promise<SessionResponse> {
    const result = await this.accounts.signIn(dto);
    this.cookie.set(response, result.issued);
    return result.session;
  }

  @SessionOnly()
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@CurrentSession() session: SessionPrincipal, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.sessions.revoke(session.sessionId);
    this.cookie.clear(response);
  }

  @SessionOnly()
  @Post('switch-account')
  @HttpCode(HttpStatus.OK)
  switchAccount(@CurrentSession() session: SessionPrincipal, @Body() dto: SwitchAccountDto): Promise<SessionResponse> {
    return this.accounts.switchAccount(session, dto.accountId);
  }

  @SessionOnly()
  @Get('me')
  me(@CurrentSession() session: SessionPrincipal): Promise<SessionResponse> {
    return this.accounts.describeSession(session.userId, session.accountId);
  }
}
