import { Controller, Get, Query } from '@nestjs/common';
import { CurrentPrincipal, RequireScope } from '@/common/auth/auth.decorators';
import type { Principal } from '@/common/auth/principal';
import { DailyUsageQueryDto, UsageRangeQueryDto } from './dto/usage-range.query.dto';
import { UsageService } from './usage.service';

@RequireScope('messages:read')
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('summary')
  summary(@CurrentPrincipal() principal: Principal) {
    return this.usage.summary(principal.accountId);
  }

  @Get('daily')
  daily(@CurrentPrincipal() principal: Principal, @Query() query: DailyUsageQueryDto) {
    return this.usage.daily(principal.accountId, query);
  }

  @Get('devices')
  devices(@CurrentPrincipal() principal: Principal, @Query() query: UsageRangeQueryDto) {
    return this.usage.byDevice(principal.accountId, query);
  }
}
