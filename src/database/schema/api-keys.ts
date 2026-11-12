import { index, pgTable, text } from 'drizzle-orm/pg-core';
import { accounts, users } from './accounts';
import { createdAt, tstz } from './columns';

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    scopes: text('scopes').array().notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastUsedAt: tstz('last_used_at'),
    expiresAt: tstz('expires_at'),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
  },
  (table) => [index('api_keys_account_idx').on(table.accountId, table.createdAt)],
);
