import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsDefined,
  IsIn,
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
import { DEVICE_REPORT_STATES, type DeviceReportState } from '@/messages/domain/states';

export class ReportErrorDto {
  @IsString()
  @Length(1, 64)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class StateReportDto {
  @IsString()
  @Length(1, 64)
  messageId!: string;

  @IsIn(DEVICE_REPORT_STATES)
  state!: DeviceReportState;

  @Type(() => Date)
  @IsDate()
  at!: Date;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  simSlot?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(255)
  partsCount?: number;

  @ValidateIf((report: StateReportDto) => report.state === 'failed' || report.error !== undefined)
  @IsDefined({ message: 'error is required when state is failed' })
  @ValidateNested()
  @Type(() => ReportErrorDto)
  error?: ReportErrorDto;
}

export class ReportStatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StateReportDto)
  reports!: StateReportDto[];
}
