import { IsIn } from 'class-validator';
import { ROLES, type Role } from '@/common/auth/roles';

export class UpdateMemberDto {
  @IsIn(ROLES)
  role!: Role;
}
