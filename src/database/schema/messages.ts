import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { bytea, createdAt, tstz, updatedAt } from './columns';
import { devices } from './devices';

export const messageTypeEnum = pgEnum('message_type', ['sms', 'data', 'mms']);
export const messagePriorityEnum = pgEnum('message_priority', ['normal', 'otp']);
export const messageStateEnum = pgEnum('message_state', [
  'scheduled',
  'pending',
  'leased',
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
  'cancelled',
  'expired',
]);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    apiKeyId: text('api_key_id'),
    type: messageTypeEnum('type').notNull(),
    to: text('to').notNull(),
    text: text('text'),
    data: text('data'),
    port: integer('port'),
    subject: text('subject'),
    priority: messagePriorityEnum('priority').notNull().default('normal'),
    state: messageStateEnum('state').notNull(),
    idempotencyKey: text('idempotency_key'),
    requestHash: text('request_hash').notNull(),
    requestedDeviceId: text('requested_device_id'),
    requestedSimSlot: integer('requested_sim_slot'),
    deviceId: text('device_id').references(() => devices.id, { onDelete: 'set null' }),
    simSlot: integer('sim_slot'),
    lastDeviceId: text('last_device_id'),
    scheduleAt: tstz('schedule_at'),
    validUntil: tstz('valid_until'),
    deliveryReport: boolean('delivery_report').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, string>>().notNull().default({}),
    attempts: integer('attempts').notNull().default(0),
    partsCount: integer('parts_count'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    leasedAt: tstz('leased_at'),
    leaseExpiresAt: tstz('lease_expires_at'),
    sentAt: tstz('sent_at'),
    deliveredAt: tstz('delivered_at'),
    failedAt: tstz('failed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('messages_idempotency_idx').on(table.accountId, table.idempotencyKey),
    index('messages_account_created_idx').on(table.accountId, table.createdAt, table.id),
    index('messages_queue_idx').on(table.accountId, table.state, table.priority, table.createdAt),
    index('messages_device_leased_idx').on(table.deviceId, table.leasedAt),
    index('messages_lease_expiry_idx').on(table.state, table.leaseExpiresAt),
    index('messages_schedule_idx').on(table.state, table.scheduleAt),
    index('messages_sent_idx').on(table.accountId, table.sentAt),
    index('messages_delivered_idx').on(table.accountId, table.deliveredAt),
    index('messages_failed_idx').on(table.accountId, table.failedAt),
  ],
);

export const messageAttachments = pgTable(
  'message_attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    contentType: text('content_type').notNull(),
    name: text('name'),
    size: integer('size').notNull(),
    data: bytea('data').notNull(),
  },
  (table) => [index('message_attachments_message_idx').on(table.messageId, table.position)],
);

export const messageEvents = pgTable(
  'message_events',
  {
    id: text('id').primaryKey(),
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    state: messageStateEnum('state').notNull(),
    at: tstz('at').notNull(),
    deviceId: text('device_id'),
    simSlot: integer('sim_slot'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: createdAt(),
  },
  (table) => [index('message_events_message_idx').on(table.messageId, table.seq)],
);
