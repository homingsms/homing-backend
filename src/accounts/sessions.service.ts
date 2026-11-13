import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import { CredentialsService } from '@/common/auth/credentials.service';
import { randomSecret } from '@/common/crypto/secrets';
import { addDays } from '@/common/dates';
import { newId } from '@/common/ids';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/database.types';
import { sessions, users } from '@/database/schema';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly credentials: CredentialsService,
    private readonly config: AppConfig,
  ) {}

  async issue(userId: string, accountId: string, executor: DbExecutor = this.database.db): Promise<IssuedSession> {
    const token = randomSecret() + randomSecret();
    const expiresAt = addDays(new Date(), this.config.get('SESSION_TTL_DAYS'));
    await executor.insert(sessions).values({
      id: newId('ses'),
      userId,
      accountId,
      tokenHash: this.credentials.hash(token),
      expiresAt,
    });
    await this.remember(userId, accountId, executor);
    return { token, expiresAt };
  }

  async moveTo(sessionId: string, userId: string, accountId: string, executor: DbExecutor = this.database.db): Promise<void> {
    await executor.update(sessions).set({ accountId }).where(eq(sessions.id, sessionId));
    await this.remember(userId, accountId, executor);
  }

  async revoke(sessionId: string): Promise<void> {
    await this.database.db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  async revokeInAccount(executor: DbExecutor, accountId: string, userId?: string): Promise<void> {
    await executor
      .delete(sessions)
      .where(and(eq(sessions.accountId, accountId), userId ? eq(sessions.userId, userId) : undefined));
  }

  private async remember(userId: string, accountId: string, executor: DbExecutor): Promise<void> {
    await executor.update(users).set({ lastAccountId: accountId, updatedAt: new Date() }).where(eq(users.id, userId));
  }
}
