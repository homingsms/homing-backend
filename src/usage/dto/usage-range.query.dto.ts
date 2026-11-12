import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const MAX_USAGE_DAYS = 92;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UsageRangeQueryDto {
  @Matches(DATE_PATTERN, { message: 'from must be a date such as 2026-11-01' })
  from!: string;

  @Matches(DATE_PATTERN, { message: 'to must be a date such as 2026-11-30' })
  to!: string;
}

export class DailyUsageQueryDto extends UsageRangeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;
}
