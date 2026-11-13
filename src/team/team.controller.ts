import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentSession, RequireRole, SessionOnly } from '@/common/auth/auth.decorators';
import type { SessionPrincipal } from '@/common/auth/principal';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import type { InviteResponse, InviteWithLinkResponse, TeamMemberResponse } from './entities/team.entity';
import { InvitesService } from './invites.service';
import { TeamService } from './team.service';

@SessionOnly()
@Controller('team')
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly invites: InvitesService,
  ) {}

  @Get('members')
  async members(@CurrentSession() session: SessionPrincipal): Promise<{ data: TeamMemberResponse[] }> {
    return { data: await this.team.list(session.accountId) };
  }

  @RequireRole('admin')
  @Patch('members/:userId')
  changeRole(
    @CurrentSession() session: SessionPrincipal,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<TeamMemberResponse> {
    return this.team.changeRole(session, userId, dto.role);
  }

  @Delete('members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentSession() session: SessionPrincipal, @Param('userId') userId: string): Promise<void> {
    return this.team.remove(session, userId);
  }

  @RequireRole('admin')
  @Get('invites')
  async listInvites(@CurrentSession() session: SessionPrincipal): Promise<{ data: InviteResponse[] }> {
    return { data: await this.invites.list(session.accountId) };
  }

  @RequireRole('admin')
  @Post('invites')
  createInvite(@CurrentSession() session: SessionPrincipal, @Body() dto: CreateInviteDto): Promise<InviteWithLinkResponse> {
    return this.invites.create(session, dto);
  }

  @RequireRole('admin')
  @Delete('invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvite(@CurrentSession() session: SessionPrincipal, @Param('inviteId') inviteId: string): Promise<void> {
    return this.invites.revoke(session.accountId, inviteId);
  }
}
