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
  role: UserRow['role'];
  createdAt: string;
}

export interface SessionResponse {
  user: UserResponse;
  account: AccountResponse;
}

export function toAccountResponse(row: AccountRow): AccountResponse {
  return {
    id: row.id,
    name: row.name,
    routingStrategy: row.routingStrategy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUserResponse(row: UserRow): UserResponse {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}
