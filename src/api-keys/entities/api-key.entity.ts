import { toIso } from '@/common/dates';
import type { Scope } from '@/common/auth/scopes';
import type { apiKeys } from '@/database/schema';

export type ApiKeyRow = typeof apiKeys.$inferSelect;

export interface ApiKeyResponse {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface ApiKeyWithSecretResponse extends ApiKeyResponse {
  secret: string;
}

export function toApiKeyResponse(row: ApiKeyRow): ApiKeyResponse {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes as Scope[],
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: toIso(row.lastUsedAt),
    expiresAt: toIso(row.expiresAt),
    revokedAt: toIso(row.revokedAt),
  };
}
