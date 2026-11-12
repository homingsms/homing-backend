import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MESSAGE_PRIORITIES, MESSAGE_TYPES, type MessagePriority, type MessageType } from '../domain/states';
import { IsStringRecord } from './is-string-record';

export const PHONE_NUMBER_PATTERN = /^\+?[0-9]{3,15}$/;

export class MessageAttachmentDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^[\w.+-]+\/[\w.+-]+$/, { message: 'contentType must be a MIME type' })
  contentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsNotEmpty()
  data!: string;
}

export class SendMessageDto {
  @IsIn(MESSAGE_TYPES)
  type!: MessageType;

  @Matches(PHONE_NUMBER_PATTERN, { message: 'to must be a phone number such as +2348012345678' })
  to!: string;

  @IsOptional()
  @IsString()
  @Length(1, 1600)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(188)
  data?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  subject?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentDto)
  attachments?: MessageAttachmentDto[];

  @IsOptional()
  @IsString()
  @Length(1, 128)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  deviceId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  simSlot?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduleAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  @IsOptional()
  @IsIn(MESSAGE_PRIORITIES)
  priority?: MessagePriority;

  @IsOptional()
  @IsBoolean()
  deliveryReport?: boolean;

  @IsOptional()
  @IsStringRecord(20, 500)
  metadata?: Record<string, string>;
}
