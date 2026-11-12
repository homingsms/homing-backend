import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountsService } from './accounts.service';
import { AuthController } from './auth.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [AuthController, AccountController],
  providers: [AccountsService, SessionsService],
  exports: [AccountsService],
})
export class AccountsModule {}
