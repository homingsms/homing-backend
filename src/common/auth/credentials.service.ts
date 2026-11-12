import { Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import { hashSecret } from '@/common/crypto/secrets';
import { DatabaseService } from '@/database/database.service';
import { apiKeys, devices, sessions, users } from '@/database/schema';
import { LAST_USED_WRITE_INTERVAL_MS } from './constants';
import type { ApiKeyPrincipal, DevicePrincipal, SessionPrincipal } from './principal';
import { SCOPES, type Scope } from './scopes';

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
  ) {}

  hash(value: string): string {
    return hashSecret(this.config.get('SECRET_PEPPER'), value);
  }

  async resolveSession(token: string): Promise<SessionPrincipal | null> {
    const [row] = await this.database.db
      .select({ sessionId: sessions.id, userId: users.id, accountId: users.accountId })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, this.hash(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    return row ? { kind: 'session', ...row } : null;
  }

  async resolveApiKey(secret: string): Promise<ApiKeyPrincipal | null> {
    const [row] = await this.database.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, this.hash(secret)))
      .limit(1);
    const now = new Date();
    if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= now)) {
      return null;
    }
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS) {
      this.database.db
        .update(apiKeys)
        .set({ lastUsedAt: now })
        .where(eq(apiKeys.id, row.id))
        .catch((error: unknown) => this.logger.warn(`Could not record API key use: ${String(error)}`));
    }
    return {
      kind: 'apiKey',
      accountId: row.accountId,
      apiKeyId: row.id,
      scopes: row.scopes.filter((scope): scope is Scope => (SCOPES as readonly string[]).includes(scope)),
    };
  }

  async resolveDevice(token: string): Promise<DevicePrincipal | null> {
    const [row] = await this.database.db
      .select({ id: devices.id, accountId: devices.accountId })
      .from(devices)
      .where(and(eq(devices.tokenHash, this.hash(token)), isNull(devices.removedAt)))
      .limit(1);
    return row ?? null;
  }
}
