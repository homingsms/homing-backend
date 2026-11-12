import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PULL_LIMIT = 10;
export const MAX_PULL_LIMIT = 50;

export class PullMessagesDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PULL_LIMIT)
  limit?: number;
}
