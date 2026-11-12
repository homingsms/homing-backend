import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import { CredentialsService } from '@/common/auth/credentials.service';
import { randomSecret } from '@/common/crypto/secrets';
import { addDays } from '@/common/dates';
import { newId } from '@/common/ids';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/database.types';
import { sessions } from '@/database/schema';

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

  async issue(userId: string, executor: DbExecutor = this.database.db): Promise<IssuedSession> {
    const token = randomSecret() + randomSecret();
    const expiresAt = addDays(new Date(), this.config.get('SESSION_TTL_DAYS'));
    await executor.insert(sessions).values({
      id: newId('ses'),
      userId,
      tokenHash: this.credentials.hash(token),
      expiresAt,
    });
    return { token, expiresAt };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.database.db.delete(sessions).where(eq(sessions.id, sessionId));
  }
}
