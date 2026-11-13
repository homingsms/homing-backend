import { type AnyPgColumn, index, pgEnum, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { createdAt, tstz, updatedAt } from './columns';

export const routingStrategyEnum = pgEnum('routing_strategy', ['round_robin', 'least_used']);
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member']);

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  routingStrategy: routingStrategyEnum('routing_strategy').notNull().default('round_robin'),
  lastRoutedDeviceId: text('last_routed_device_id'),
  deletedAt: tstz('deleted_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  lastAccountId: text('last_account_id').references((): AnyPgColumn => accounts.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const accountMembers = pgTable(
  'account_members',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').notNull().default('member'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.userId] }),
    index('account_members_user_idx').on(table.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('sessions_user_idx').on(table.userId), index('sessions_account_idx').on(table.accountId)],
);

export const teamInvites = pgTable(
  'team_invites',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: userRoleEnum('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedByUserId: text('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: tstz('expires_at').notNull(),
    acceptedAt: tstz('accepted_at'),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
  },
  (table) => [index('team_invites_account_idx').on(table.accountId, table.createdAt)],
);
