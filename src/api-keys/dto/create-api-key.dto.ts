import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsDate, IsIn, IsOptional, IsString, Length, MinDate } from 'class-validator';
import { SCOPES, type Scope } from '@/common/auth/scopes';

export class CreateApiKeyDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(SCOPES, { each: true })
  scopes!: Scope[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), { message: 'expiresAt must be in the future' })
  expiresAt?: Date;
}
