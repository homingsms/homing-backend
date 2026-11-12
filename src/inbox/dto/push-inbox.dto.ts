import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MESSAGE_TYPES, type MessageType } from '@/messages/domain/states';

export class InboxAttachmentUploadDto {
  @IsString()
  @MaxLength(100)
  contentType!: string;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(255)
  name?: string | null;

  @IsString()
  @IsNotEmpty()
  data!: string;
}

export class InboxUploadDto {
  @IsString()
  @Length(1, 64)
  localId!: string;

  @IsIn(MESSAGE_TYPES)
  type!: MessageType;

  @IsString()
  @Length(1, 32)
  from!: string;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(32)
  to?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  simSlot?: number;

  @Type(() => Date)
  @IsDate()
  receivedAt!: Date;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  data?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InboxAttachmentUploadDto)
  attachments?: InboxAttachmentUploadDto[];
}

export class PushInboxDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => InboxUploadDto)
  messages!: InboxUploadDto[];
}
