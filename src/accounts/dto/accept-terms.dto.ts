import { IsString, Length } from 'class-validator';

export class AcceptTermsDto {
  @IsString()
  @Length(1, 32)
  version!: string;
}
