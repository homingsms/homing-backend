import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { API_KEY_DISPLAY_LENGTH, API_KEY_PREFIX } from '@/common/auth/constants';
import { CredentialsService } from '@/common/auth/credentials.service';
import type { Principal } from '@/common/auth/principal';
import { randomSecret } from '@/common/crypto/secrets';
import { newId } from '@/common/ids';
import { DatabaseService } from '@/database/database.service';
import { apiKeys } from '@/database/schema';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';
import {
  type ApiKeyResponse,
  type ApiKeyWithSecretResponse,
  toApiKeyResponse,
} from './entities/api-key.entity';

export function generateApiKeySecret(): { secret: string; prefix: string } {
  const secret = `${API_KEY_PREFIX}${randomSecret()}`;
  return { secret, prefix: secret.slice(0, API_KEY_DISPLAY_LENGTH) };
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly database: DatabaseService,
    private readonly credentials: CredentialsService,
  ) {}

  async list(accountId: string): Promise<ApiKeyResponse[]> {
    const rows = await this.database.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.accountId, accountId))
      .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id));
    return rows.map(toApiKeyResponse);
  }

  async create(principal: Principal, dto: CreateApiKeyDto): Promise<ApiKeyWithSecretResponse> {
    const { secret, prefix } = generateApiKeySecret();
    const [row] = await this.database.db
      .insert(apiKeys)
      .values({
        id: newId('key'),
        accountId: principal.accountId,
        name: dto.name,
        prefix,
        keyHash: this.credentials.hash(secret),
        scopes: dto.scopes,
        createdByUserId: principal.kind === 'session' ? principal.userId : null,
        expiresAt: dto.expiresAt ?? null,
      })
      .returning();
    return { ...toApiKeyResponse(row!), secret };
  }

  async revoke(accountId: string, id: string): Promise<void> {
    const [existing] = await this.database.db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.accountId, accountId)))
      .limit(1);
    if (!existing) {
      throw new NotFoundException('API key not found');
    }
    await this.database.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)));
  }
}
