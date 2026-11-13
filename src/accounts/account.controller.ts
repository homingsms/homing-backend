import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal, CurrentSession, RequireRole, SessionOnly } from '@/common/auth/auth.decorators';
import type { Principal, SessionPrincipal } from '@/common/auth/principal';
import { AccountDeletionService } from './account-deletion.service';
import { AccountsService } from './accounts.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import type { AccountResponse } from './entities/account.entity';
import { SessionCookie } from './session-cookie';

@Controller('account')
export class AccountController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly deletion: AccountDeletionService,
    private readonly cookie: SessionCookie,
  ) {}

  @Get()
  get(@CurrentPrincipal() principal: Principal): Promise<AccountResponse> {
    return this.accounts.getAccount(principal.accountId);
  }

  @RequireRole('admin')
  @Patch()
  update(@CurrentPrincipal() principal: Principal, @Body() dto: UpdateAccountDto): Promise<AccountResponse> {
    return this.accounts.updateAccount(principal.accountId, dto);
  }

  @SessionOnly()
  @RequireRole('owner')
  @Post('deletion')
  @HttpCode(HttpStatus.ACCEPTED)
  async delete(
    @CurrentSession() session: SessionPrincipal,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.deletion.request(session.accountId, dto.accountName);
    this.cookie.clear(response);
  }
}
