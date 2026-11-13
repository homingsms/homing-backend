import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SignUpDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(10, 128)
  password!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  accountName?: string;

  @IsOptional()
  @IsString()
  @Length(10, 200)
  inviteToken?: string;
}
