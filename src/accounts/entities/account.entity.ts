import type { Role } from '@/common/auth/roles';
import type { accounts, users } from '@/database/schema';

export type AccountRow = typeof accounts.$inferSelect;
export type UserRow = typeof users.$inferSelect;

export interface AccountResponse {
  id: string;
  name: string;
  routingStrategy: AccountRow['routingStrategy'];
  createdAt: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface MembershipResponse {
  accountId: string;
  accountName: string;
  role: Role;
}

export interface SessionResponse {
  user: UserResponse;
  account: AccountResponse;
  memberships: MembershipResponse[];
}

export function toAccountResponse(row: AccountRow): AccountResponse {
  return {
    id: row.id,
    name: row.name,
    routingStrategy: row.routingStrategy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUserResponse(row: UserRow, role: Role): UserResponse {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role,
    createdAt: row.createdAt.toISOString(),
  };
}
