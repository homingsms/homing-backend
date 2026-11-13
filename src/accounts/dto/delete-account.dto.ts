import { IsString, Length } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @Length(1, 100)
  accountName!: string;
}
