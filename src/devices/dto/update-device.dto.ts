import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const MAX_DAILY_LIMIT = 100_000;

export class SimSettingsDto {
  @IsInt()
  @Min(0)
  @Max(7)
  slot!: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DAILY_LIMIT)
  dailyLimit?: number | null;
}

export class UpdateDeviceDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DAILY_LIMIT)
  dailyLimit?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => SimSettingsDto)
  sims?: SimSettingsDto[];
}
