import { boolean, index, integer, jsonb, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { createdAt, tstz, updatedAt } from './columns';

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
  'pending',
  'retrying',
  'succeeded',
  'failed',
]);

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    description: text('description'),
    events: text('events').array().notNull(),
    secretCiphertext: text('secret_ciphertext').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('webhook_endpoints_account_idx').on(table.accountId, table.createdAt)],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('webhook_events_account_idx').on(table.accountId, table.createdAt)],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => webhookEvents.id, { onDelete: 'cascade' }),
    status: webhookDeliveryStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastStatusCode: integer('last_status_code'),
    lastResponseBody: text('last_response_body'),
    lastError: text('last_error'),
    nextAttemptAt: tstz('next_attempt_at'),
    deliveredAt: tstz('delivered_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('webhook_deliveries_endpoint_idx').on(table.endpointId, table.createdAt, table.id)],
);
