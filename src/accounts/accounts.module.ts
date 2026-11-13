import { Module } from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service';
import { AccountController } from './account.controller';
import { AccountsService } from './accounts.service';
import { AuthController } from './auth.controller';
import { SessionCookie } from './session-cookie';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [AuthController, AccountController],
  providers: [AccountsService, SessionsService, SessionCookie, AccountDeletionService],
  exports: [AccountsService, SessionsService, SessionCookie, AccountDeletionService],
})
export class AccountsModule {}
