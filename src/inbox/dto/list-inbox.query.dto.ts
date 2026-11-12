import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/pagination/pagination-query.dto';
import { MESSAGE_TYPES, type MessageType } from '@/messages/domain/states';

export class ListInboxQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(MESSAGE_TYPES)
  type?: MessageType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/^ /, '+') : value))
  @IsString()
  @MaxLength(32)
  from?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  receivedFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  receivedTo?: Date;
}
