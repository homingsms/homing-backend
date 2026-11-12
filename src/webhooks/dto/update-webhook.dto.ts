import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { SUBSCRIBABLE_EVENT_TYPES, type SubscribableEventType } from '../domain/event-types';

export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false, protocols: ['http', 'https'] })
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(SUBSCRIBABLE_EVENT_TYPES, { each: true })
  events?: SubscribableEventType[];

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
