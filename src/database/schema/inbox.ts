import { index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { bytea, createdAt, tstz } from './columns';
import { devices } from './devices';
import { messageTypeEnum } from './messages';

export const inboxMessages = pgTable(
  'inbox_messages',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').references(() => devices.id, { onDelete: 'set null' }),
    localId: text('local_id').notNull(),
    type: messageTypeEnum('type').notNull(),
    from: text('from').notNull(),
    to: text('to'),
    simSlot: integer('sim_slot'),
    text: text('text'),
    data: text('data'),
    port: integer('port'),
    subject: text('subject'),
    receivedAt: tstz('received_at').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('inbox_device_local_idx').on(table.deviceId, table.localId),
    index('inbox_account_received_idx').on(table.accountId, table.receivedAt, table.id),
  ],
);

export const inboxAttachments = pgTable(
  'inbox_attachments',
  {
    id: text('id').primaryKey(),
    inboxMessageId: text('inbox_message_id')
      .notNull()
      .references(() => inboxMessages.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    contentType: text('content_type').notNull(),
    name: text('name'),
    size: integer('size').notNull(),
    data: bytea('data').notNull(),
  },
  (table) => [index('inbox_attachments_message_idx').on(table.inboxMessageId, table.position)],
);
