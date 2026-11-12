import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentPrincipal } from '@/common/auth/auth.decorators';
import type { Principal } from '@/common/auth/principal';
import { AccountsService } from './accounts.service';
import { UpdateAccountDto } from './dto/update-account.dto';
import type { AccountResponse } from './entities/account.entity';

@Controller('account')
export class AccountController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  get(@CurrentPrincipal() principal: Principal): Promise<AccountResponse> {
    return this.accounts.getAccount(principal.accountId);
  }

  @Patch()
  update(@CurrentPrincipal() principal: Principal, @Body() dto: UpdateAccountDto): Promise<AccountResponse> {
    return this.accounts.updateAccount(principal.accountId, dto);
  }
}
