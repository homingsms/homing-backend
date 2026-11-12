import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const NETWORK_TYPES = ['wifi', 'cellular', 'ethernet', 'none', 'unknown'] as const;
export type NetworkType = (typeof NETWORK_TYPES)[number];

export class BatteryDto {
  @IsInt()
  @Min(0)
  @Max(100)
  level!: number;

  @IsBoolean()
  charging!: boolean;
}

export class NetworkDto {
  @IsIn(NETWORK_TYPES)
  type!: NetworkType;
}

export class SimHealthDto {
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
  @IsInt()
  @Min(0)
  @Max(4)
  signalLevel?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sentToday?: number;
}

export class HeartbeatDto {
  @IsString()
  @MaxLength(50)
  appVersion!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => BatteryDto)
  battery!: BatteryDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => NetworkDto)
  network!: NetworkDto;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => SimHealthDto)
  sims!: SimHealthDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  localQueueSize?: number;
}

export class FcmTokenDto {
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(4096)
  fcmToken!: string | null;
}
