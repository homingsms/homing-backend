import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import { randomSecret } from '@/common/crypto/secrets';
import { newId } from '@/common/ids';
import { isUniqueViolation } from '@/common/postgres-errors';
import { DatabaseService } from '@/database/database.service';
import { accounts, users } from '@/database/schema';
import type { SignInDto } from './dto/sign-in.dto';
import type { SignUpDto } from './dto/sign-up.dto';
import type { UpdateAccountDto } from './dto/update-account.dto';
import {
  type AccountResponse,
  type SessionResponse,
  toAccountResponse,
  toUserResponse,
} from './entities/account.entity';
import { type IssuedSession, SessionsService } from './sessions.service';

export interface AuthResult {
  session: SessionResponse;
  issued: IssuedSession;
}

@Injectable()
export class AccountsService {
  private timingHash: Promise<string> | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionsService,
    private readonly config: AppConfig,
  ) {}

  async signUp(dto: SignUpDto): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(dto.password, this.config.get('BCRYPT_ROUNDS'));
    try {
      return await this.database.db.transaction(async (tx) => {
        const [account] = await tx
          .insert(accounts)
          .values({ id: newId('acc'), name: dto.accountName ?? dto.name })
          .returning();
        const [user] = await tx
          .insert(users)
          .values({
            id: newId('usr'),
            accountId: account!.id,
            email: dto.email,
            name: dto.name,
            passwordHash,
            role: 'owner',
          })
          .returning();
        const issued = await this.sessions.issue(user!.id, tx);
        return {
          session: { user: toUserResponse(user!), account: toAccountResponse(account!) },
          issued,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  async signIn(dto: SignInDto): Promise<AuthResult> {
    const [user] = await this.database.db.select().from(users).where(eq(users.email, dto.email)).limit(1);
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? (await this.dummyHash()));
    if (!user || !valid) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    const issued = await this.sessions.issue(user.id);
    return { session: await this.describeSession(user.id), issued };
  }

  private dummyHash(): Promise<string> {
    this.timingHash ??= bcrypt.hash(randomSecret(), this.config.get('BCRYPT_ROUNDS'));
    return this.timingHash;
  }

  async describeSession(userId: string): Promise<SessionResponse> {
    const [row] = await this.database.db
      .select({ user: users, account: accounts })
      .from(users)
      .innerJoin(accounts, eq(accounts.id, users.accountId))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) {
      throw new UnauthorizedException();
    }
    return { user: toUserResponse(row.user), account: toAccountResponse(row.account) };
  }

  async getAccount(accountId: string): Promise<AccountResponse> {
    const [row] = await this.database.db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!row) {
      throw new NotFoundException('Account not found');
    }
    return toAccountResponse(row);
  }

  async updateAccount(accountId: string, dto: UpdateAccountDto): Promise<AccountResponse> {
    const [row] = await this.database.db
      .update(accounts)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(accounts.id, accountId))
      .returning();
    if (!row) {
      throw new NotFoundException('Account not found');
    }
    return toAccountResponse(row);
  }
}
