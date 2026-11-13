import { Transform } from 'class-transformer';
import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { INVITE_ROLES, type InviteRole } from '@/common/auth/roles';

export class CreateInviteDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(INVITE_ROLES)
  role!: InviteRole;
}
