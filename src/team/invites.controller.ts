import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { SessionResponse } from '@/accounts/entities/account.entity';
import { CurrentSession, Public, SessionOnly } from '@/common/auth/auth.decorators';
import type { SessionPrincipal } from '@/common/auth/principal';
import { StrictThrottle } from '@/common/http/throttling';
import type { InvitePreviewResponse } from './entities/team.entity';
import { InvitesService } from './invites.service';

@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Public()
  @StrictThrottle()
  @Get(':token')
  preview(@Param('token') token: string): Promise<InvitePreviewResponse> {
    return this.invites.preview(token);
  }

  @SessionOnly()
  @StrictThrottle()
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentSession() session: SessionPrincipal, @Param('token') token: string): Promise<SessionResponse> {
    return this.invites.accept(session, token);
  }
}
