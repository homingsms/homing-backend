import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Role } from '@/common/auth/roles';
import type { DbExecutor } from '@/database/database.types';
import { accountMembers, accounts } from '@/database/schema';
import type { MembershipResponse } from './entities/account.entity';

export async function listMemberships(executor: DbExecutor, userId: string): Promise<MembershipResponse[]> {
  return executor
    .select({ accountId: accounts.id, accountName: accounts.name, role: accountMembers.role })
    .from(accountMembers)
    .innerJoin(accounts, eq(accounts.id, accountMembers.accountId))
    .where(and(eq(accountMembers.userId, userId), isNull(accounts.deletedAt)))
    .orderBy(asc(accountMembers.createdAt), asc(accounts.id));
}

export async function findMembership(
  executor: DbExecutor,
  userId: string,
  accountId: string,
): Promise<{ role: Role } | null> {
  const [row] = await executor
    .select({ role: accountMembers.role })
    .from(accountMembers)
    .innerJoin(accounts, eq(accounts.id, accountMembers.accountId))
    .where(and(eq(accountMembers.userId, userId), eq(accountMembers.accountId, accountId), isNull(accounts.deletedAt)))
    .limit(1);
  return row ?? null;
}

export function pickAccount(memberships: MembershipResponse[], preferred: string | null): MembershipResponse | null {
  return memberships.find((membership) => membership.accountId === preferred) ?? memberships[0] ?? null;
}
