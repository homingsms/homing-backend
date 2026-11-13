import { Module } from '@nestjs/common';
import { AccountsModule } from '@/accounts/accounts.module';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [AccountsModule],
  controllers: [TeamController, InvitesController],
  providers: [TeamService, InvitesService],
})
export class TeamModule {}
