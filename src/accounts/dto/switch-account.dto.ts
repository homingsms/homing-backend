import { IsString, Length } from 'class-validator';

export class SwitchAccountDto {
  @IsString()
  @Length(1, 64)
  accountId!: string;
}
