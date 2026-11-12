import { index, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, tstz, updatedAt } from './columns';

export const routingStrategyEnum = pgEnum('routing_strategy', ['round_robin', 'least_used']);
export const userRoleEnum = pgEnum('user_role', ['owner', 'member']);

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  routingStrategy: routingStrategyEnum('routing_strategy').notNull().default('round_robin'),
  lastRoutedDeviceId: text('last_routed_device_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('member'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('users_account_idx').on(table.accountId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);
