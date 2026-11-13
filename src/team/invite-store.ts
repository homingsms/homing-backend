import { and, eq, gt, isNull } from 'drizzle-orm';
import type { InviteRole, Role } from '@/common/auth/roles';
import type { DbExecutor } from '@/database/database.types';
import { accountMembers, accounts, teamInvites } from '@/database/schema';

export const INVITE_TOKEN_PREFIX = 'hi_';

export interface OpenInvite {
  id: string;
  accountId: string;
  accountName: string;
  email: string;
  role: InviteRole;
  invitedByUserId: string | null;
  expiresAt: Date;
}

export function isInviteRole(role: Role): role is InviteRole {
  return role === 'admin' || role === 'member';
}

export async function findOpenInvite(
  executor: DbExecutor,
  tokenHash: string,
  now: Date,
  lock = false,
): Promise<OpenInvite | null> {
  const query = executor
    .select({
      id: teamInvites.id,
      accountId: teamInvites.accountId,
      accountName: accounts.name,
      email: teamInvites.email,
      role: teamInvites.role,
      invitedByUserId: teamInvites.invitedByUserId,
      expiresAt: teamInvites.expiresAt,
    })
    .from(teamInvites)
    .innerJoin(accounts, eq(accounts.id, teamInvites.accountId))
    .where(
      and(
        eq(teamInvites.tokenHash, tokenHash),
        isNull(teamInvites.acceptedAt),
        isNull(teamInvites.revokedAt),
        gt(teamInvites.expiresAt, now),
        isNull(accounts.deletedAt),
      ),
    )
    .limit(1);
  const [row] = lock ? await query.for('update', { of: teamInvites }) : await query;
  if (!row || !isInviteRole(row.role)) {
    return null;
  }
  return { ...row, role: row.role };
}

export async function acceptInvite(executor: DbExecutor, invite: OpenInvite, userId: string, now: Date): Promise<void> {
  await executor
    .insert(accountMembers)
    .values({ accountId: invite.accountId, userId, role: invite.role })
    .onConflictDoNothing();
  await executor.update(teamInvites).set({ acceptedAt: now }).where(eq(teamInvites.id, invite.id));
}
