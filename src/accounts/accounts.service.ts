import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { and, eq, isNull } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import { CredentialsService } from '@/common/auth/credentials.service';
import type { SessionPrincipal } from '@/common/auth/principal';
import { randomSecret } from '@/common/crypto/secrets';
import { newId } from '@/common/ids';
import { isUniqueViolation } from '@/common/postgres-errors';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor, Transaction } from '@/database/database.types';
import { accountMembers, accounts, users } from '@/database/schema';
import { acceptInvite, findOpenInvite } from '@/team/invite-store';
import type { SignInDto } from './dto/sign-in.dto';
import type { SignUpDto } from './dto/sign-up.dto';
import type { UpdateAccountDto } from './dto/update-account.dto';
import { type AccountResponse, type SessionResponse, toAccountResponse, toUserResponse } from './entities/account.entity';
import { findMembership, listMemberships, pickAccount } from './memberships';
import { type IssuedSession, SessionsService } from './sessions.service';

export interface AuthResult {
  session: SessionResponse;
  issued: IssuedSession;
}

export const INVITE_EMAIL_MISMATCH = 'This invite was sent to a different email address';
const INVALID_INVITE = 'inviteToken is invalid, used or expired';

interface NewMember {
  userId: string;
  accountId: string;
}

@Injectable()
export class AccountsService {
  private timingHash: Promise<string> | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionsService,
    private readonly credentials: CredentialsService,
    private readonly config: AppConfig,
  ) {}

  async signUp(dto: SignUpDto): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(dto.password, this.config.get('BCRYPT_ROUNDS'));
    try {
      return await this.database.db.transaction(async (tx) => {
        const { userId, accountId } = dto.inviteToken
          ? await this.joinByInvite(tx, dto, dto.inviteToken, passwordHash)
          : await this.createOwner(tx, dto, passwordHash);
        const issued = await this.sessions.issue(userId, accountId, tx);
        return { session: await this.describeSession(userId, accountId, tx), issued };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  private async createOwner(tx: Transaction, dto: SignUpDto, passwordHash: string): Promise<NewMember> {
    const [account] = await tx
      .insert(accounts)
      .values({ id: newId('acc'), name: dto.accountName ?? dto.name })
      .returning({ id: accounts.id });
    const userId = await this.insertUser(tx, dto, passwordHash);
    await tx.insert(accountMembers).values({ accountId: account!.id, userId, role: 'owner' });
    return { userId, accountId: account!.id };
  }

  private async joinByInvite(tx: Transaction, dto: SignUpDto, token: string, passwordHash: string): Promise<NewMember> {
    const now = new Date();
    const invite = await findOpenInvite(tx, this.credentials.hash(token), now, true);
    if (!invite) {
      throw new BadRequestException([INVALID_INVITE]);
    }
    if (invite.email !== dto.email) {
      throw new ForbiddenException(INVITE_EMAIL_MISMATCH);
    }
    const userId = await this.insertUser(tx, dto, passwordHash);
    await acceptInvite(tx, invite, userId, now);
    return { userId, accountId: invite.accountId };
  }

  private async insertUser(tx: Transaction, dto: SignUpDto, passwordHash: string): Promise<string> {
    const [user] = await tx
      .insert(users)
      .values({ id: newId('usr'), email: dto.email, name: dto.name, passwordHash })
      .returning({ id: users.id });
    return user!.id;
  }

  async signIn(dto: SignInDto): Promise<AuthResult> {
    const [user] = await this.database.db.select().from(users).where(eq(users.email, dto.email)).limit(1);
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? (await this.dummyHash()));
    if (!user || !valid) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    const membership = pickAccount(await listMemberships(this.database.db, user.id), user.lastAccountId);
    if (!membership) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    const issued = await this.sessions.issue(user.id, membership.accountId);
    return { session: await this.describeSession(user.id, membership.accountId), issued };
  }

  private dummyHash(): Promise<string> {
    this.timingHash ??= bcrypt.hash(randomSecret(), this.config.get('BCRYPT_ROUNDS'));
    return this.timingHash;
  }

  async describeSession(userId: string, accountId: string, executor: DbExecutor = this.database.db): Promise<SessionResponse> {
    const [row] = await executor
      .select({ user: users, account: accounts, role: accountMembers.role })
      .from(accountMembers)
      .innerJoin(users, eq(users.id, accountMembers.userId))
      .innerJoin(accounts, eq(accounts.id, accountMembers.accountId))
      .where(and(eq(accountMembers.userId, userId), eq(accountMembers.accountId, accountId), isNull(accounts.deletedAt)))
      .limit(1);
    if (!row) {
      throw new UnauthorizedException();
    }
    return {
      user: toUserResponse(row.user, row.role),
      account: toAccountResponse(row.account),
      memberships: await listMemberships(executor, userId),
    };
  }

  async switchAccount(session: SessionPrincipal, accountId: string): Promise<SessionResponse> {
    if (!(await findMembership(this.database.db, session.userId, accountId))) {
      throw new NotFoundException('Account not found');
    }
    await this.sessions.moveTo(session.sessionId, session.userId, accountId);
    return this.describeSession(session.userId, accountId);
  }

  async getAccount(accountId: string): Promise<AccountResponse> {
    const [row] = await this.database.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Account not found');
    }
    return toAccountResponse(row);
  }

  async updateAccount(accountId: string, dto: UpdateAccountDto): Promise<AccountResponse> {
    const [row] = await this.database.db
      .update(accounts)
      .set({ ...dto, updatedAt: new Date() })
      .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)))
      .returning();
    if (!row) {
      throw new NotFoundException('Account not found');
    }
    return toAccountResponse(row);
  }
}
