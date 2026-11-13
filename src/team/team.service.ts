import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, notExists, sql } from 'drizzle-orm';
import type { SessionPrincipal } from '@/common/auth/principal';
import { hasRole, type Role } from '@/common/auth/roles';
import { DatabaseService } from '@/database/database.service';
import type { Transaction } from '@/database/database.types';
import { accountMembers, users } from '@/database/schema';
import { SessionsService } from '@/accounts/sessions.service';
import type { TeamMemberResponse } from './entities/team.entity';

export const LAST_OWNER_MESSAGE = 'An account needs at least one owner';

interface MemberRow {
  userId: string;
  email: string;
  name: string;
  role: Role;
  joinedAt: Date;
}

function toMember(row: MemberRow): TeamMemberResponse {
  return { ...row, joinedAt: row.joinedAt.toISOString() };
}

@Injectable()
export class TeamService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionsService,
  ) {}

  async list(accountId: string): Promise<TeamMemberResponse[]> {
    const rows = await this.database.db
      .select(this.columns())
      .from(accountMembers)
      .innerJoin(users, eq(users.id, accountMembers.userId))
      .where(eq(accountMembers.accountId, accountId))
      .orderBy(asc(accountMembers.createdAt), asc(users.id));
    return rows.map(toMember);
  }

  async changeRole(actor: SessionPrincipal, userId: string, role: Role): Promise<TeamMemberResponse> {
    return this.database.db.transaction(async (tx) => {
      const members = await this.lockMembers(tx, actor.accountId);
      const target = members.find((member) => member.userId === userId);
      if (!target) {
        throw new NotFoundException('Member not found');
      }
      if ((target.role === 'owner' || role === 'owner') && !hasRole(actor.role, 'owner')) {
        throw new ForbiddenException('Only an owner can grant or change the owner role');
      }
      if (target.role === 'owner' && role !== 'owner' && this.ownerCount(members) === 1) {
        throw new ConflictException(LAST_OWNER_MESSAGE);
      }
      await tx
        .update(accountMembers)
        .set({ role, updatedAt: new Date() })
        .where(and(eq(accountMembers.accountId, actor.accountId), eq(accountMembers.userId, userId)));
      return toMember({ ...target, role });
    });
  }

  async remove(actor: SessionPrincipal, userId: string): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const members = await this.lockMembers(tx, actor.accountId);
      const target = members.find((member) => member.userId === userId);
      if (!target) {
        throw new NotFoundException('Member not found');
      }
      const self = userId === actor.userId;
      if (!self && !hasRole(actor.role, 'admin')) {
        throw new ForbiddenException('This action needs the admin role or higher');
      }
      if (!self && target.role === 'owner' && !hasRole(actor.role, 'owner')) {
        throw new ForbiddenException('Only an owner can remove an owner');
      }
      if (target.role === 'owner' && this.ownerCount(members) === 1) {
        throw new ConflictException(LAST_OWNER_MESSAGE);
      }
      await tx
        .delete(accountMembers)
        .where(and(eq(accountMembers.accountId, actor.accountId), eq(accountMembers.userId, userId)));
      await this.sessions.revokeInAccount(tx, actor.accountId, userId);
      await tx
        .delete(users)
        .where(
          and(
            eq(users.id, userId),
            notExists(tx.select({ one: sql`1` }).from(accountMembers).where(eq(accountMembers.userId, users.id))),
          ),
        );
    });
  }

  private columns() {
    return {
      userId: users.id,
      email: users.email,
      name: users.name,
      role: accountMembers.role,
      joinedAt: accountMembers.createdAt,
    };
  }

  private lockMembers(tx: Transaction, accountId: string): Promise<MemberRow[]> {
    return tx
      .select(this.columns())
      .from(accountMembers)
      .innerJoin(users, eq(users.id, accountMembers.userId))
      .where(eq(accountMembers.accountId, accountId))
      .for('update', { of: accountMembers });
  }

  private ownerCount(members: MemberRow[]): number {
    return members.filter((member) => member.role === 'owner').length;
  }
}
