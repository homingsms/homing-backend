import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class SimInfoDto {
  @IsInt()
  @Min(0)
  @Max(7)
  slot!: number;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(100)
  carrier?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(32)
  phoneNumber?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(32)
  iccid?: string | null;
}

export class PairDeviceDto {
  @IsString()
  @Length(4, 16)
  code!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  osVersion?: string;

  @IsString()
  @MaxLength(50)
  appVersion!: string;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => SimInfoDto)
  sims!: SimInfoDto[];

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(4096)
  fcmToken?: string | null;
}
