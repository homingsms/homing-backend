import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '@/common/pagination/pagination-query.dto';
import { MESSAGE_STATES, MESSAGE_TYPES, type MessageState, type MessageType } from '../domain/states';
import { PHONE_NUMBER_PATTERN } from './send-message.dto';

export class ListMessagesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(MESSAGE_STATES)
  state?: MessageState;

  @IsOptional()
  @IsIn(MESSAGE_TYPES)
  type?: MessageType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(7)
  simSlot?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/^ /, '+') : value))
  @Matches(PHONE_NUMBER_PATTERN)
  to?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdTo?: Date;
}
