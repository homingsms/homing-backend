import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AccountsService, INVITE_EMAIL_MISMATCH } from '@/accounts/accounts.service';
import type { SessionResponse } from '@/accounts/entities/account.entity';
import { SessionsService } from '@/accounts/sessions.service';
import { CredentialsService } from '@/common/auth/credentials.service';
import type { SessionPrincipal } from '@/common/auth/principal';
import type { Role } from '@/common/auth/roles';
import { randomSecret } from '@/common/crypto/secrets';
import { addDays } from '@/common/dates';
import { newId } from '@/common/ids';
import { AppConfig } from '@/config/app-config.service';
import { DatabaseService } from '@/database/database.service';
import { accountMembers, teamInvites, users } from '@/database/schema';
import type { CreateInviteDto } from './dto/create-invite.dto';
import type { InvitePreviewResponse, InviteResponse, InviteWithLinkResponse } from './entities/team.entity';
import { acceptInvite, findOpenInvite, INVITE_TOKEN_PREFIX, isInviteRole } from './invite-store';

const INVITE_NOT_FOUND = 'Invite not found, used or expired';

interface InviteRow {
  id: string;
  email: string;
  role: Role;
  invitedBy: string | null;
  expiresAt: Date;
  createdAt: Date;
}

function toInvite(row: InviteRow, now: Date): InviteResponse {
  return {
    id: row.id,
    email: row.email,
    role: isInviteRole(row.role) ? row.role : 'member',
    status: row.expiresAt > now ? 'pending' : 'expired',
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly credentials: CredentialsService,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
    private readonly config: AppConfig,
  ) {}

  async list(accountId: string): Promise<InviteResponse[]> {
    const now = new Date();
    const rows = await this.database.db
      .select({
        id: teamInvites.id,
        email: teamInvites.email,
        role: teamInvites.role,
        invitedBy: users.name,
        expiresAt: teamInvites.expiresAt,
        createdAt: teamInvites.createdAt,
      })
      .from(teamInvites)
      .leftJoin(users, eq(users.id, teamInvites.invitedByUserId))
      .where(and(eq(teamInvites.accountId, accountId), isNull(teamInvites.acceptedAt), isNull(teamInvites.revokedAt)))
      .orderBy(desc(teamInvites.createdAt), desc(teamInvites.id));
    return rows.map((row) => toInvite(row, now));
  }

  async create(actor: SessionPrincipal, dto: CreateInviteDto): Promise<InviteWithLinkResponse> {
    const now = new Date();
    const token = `${INVITE_TOKEN_PREFIX}${randomSecret()}`;
    const row = await this.database.db.transaction(async (tx) => {
      const [member] = await tx
        .select({ userId: users.id })
        .from(accountMembers)
        .innerJoin(users, eq(users.id, accountMembers.userId))
        .where(and(eq(accountMembers.accountId, actor.accountId), eq(users.email, dto.email)))
        .limit(1);
      if (member) {
        throw new ConflictException('This person is already a member of the account');
      }
      await tx
        .update(teamInvites)
        .set({ revokedAt: now })
        .where(
          and(
            eq(teamInvites.accountId, actor.accountId),
            eq(teamInvites.email, dto.email),
            isNull(teamInvites.acceptedAt),
            isNull(teamInvites.revokedAt),
          ),
        );
      const [inviter] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actor.userId));
      const [created] = await tx
        .insert(teamInvites)
        .values({
          id: newId('inv'),
          accountId: actor.accountId,
          email: dto.email,
          role: dto.role,
          tokenHash: this.credentials.hash(token),
          invitedByUserId: actor.userId,
          expiresAt: addDays(now, this.config.get('INVITE_TTL_DAYS')),
        })
        .returning();
      return { ...created!, invitedBy: inviter?.name ?? null };
    });
    return { ...toInvite(row, now), inviteUrl: this.inviteUrl(token) };
  }

  async revoke(accountId: string, inviteId: string): Promise<void> {
    const rows = await this.database.db
      .update(teamInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(teamInvites.id, inviteId),
          eq(teamInvites.accountId, accountId),
          isNull(teamInvites.acceptedAt),
          isNull(teamInvites.revokedAt),
        ),
      )
      .returning({ id: teamInvites.id });
    if (rows.length === 0) {
      throw new NotFoundException('Invite not found');
    }
  }

  async preview(token: string): Promise<InvitePreviewResponse> {
    const invite = await findOpenInvite(this.database.db, this.credentials.hash(token), new Date());
    if (!invite) {
      throw new NotFoundException(INVITE_NOT_FOUND);
    }
    const [inviter] = invite.invitedByUserId
      ? await this.database.db.select({ name: users.name }).from(users).where(eq(users.id, invite.invitedByUserId))
      : [];
    return {
      accountName: invite.accountName,
      email: invite.email,
      role: invite.role,
      invitedBy: inviter?.name ?? null,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async accept(session: SessionPrincipal, token: string): Promise<SessionResponse> {
    const now = new Date();
    const accountId = await this.database.db.transaction(async (tx) => {
      const invite = await findOpenInvite(tx, this.credentials.hash(token), now, true);
      if (!invite) {
        throw new NotFoundException(INVITE_NOT_FOUND);
      }
      const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, session.userId));
      if (user?.email !== invite.email) {
        throw new ForbiddenException(INVITE_EMAIL_MISMATCH);
      }
      await acceptInvite(tx, invite, session.userId, now);
      await this.sessions.moveTo(session.sessionId, session.userId, invite.accountId, tx);
      return invite.accountId;
    });
    return this.accounts.describeSession(session.userId, accountId);
  }

  private inviteUrl(token: string): string {
    return `${this.config.get('CONSOLE_URL').replace(/\/$/, '')}/invite/${token}`;
  }
}
