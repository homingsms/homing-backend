import { boolean, index, integer, pgEnum, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { createdAt, tstz, updatedAt } from './columns';

export const deviceStatusEnum = pgEnum('device_status', ['online', 'offline']);

export const pairingCodes = pgTable(
  'pairing_codes',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull().unique(),
    deviceName: text('device_name'),
    expiresAt: tstz('expires_at').notNull(),
    usedAt: tstz('used_at'),
    createdAt: createdAt(),
  },
  (table) => [index('pairing_codes_account_idx').on(table.accountId)],
);

export const devices = pgTable(
  'devices',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    model: text('model'),
    manufacturer: text('manufacturer'),
    osVersion: text('os_version'),
    appVersion: text('app_version'),
    fcmToken: text('fcm_token'),
    status: deviceStatusEnum('status').notNull().default('online'),
    paused: boolean('paused').notNull().default(false),
    dailyLimit: integer('daily_limit'),
    settingsVersion: integer('settings_version').notNull().default(1),
    lastSeenAt: tstz('last_seen_at'),
    batteryLevel: integer('battery_level'),
    charging: boolean('charging'),
    networkType: text('network_type'),
    localQueueSize: integer('local_queue_size'),
    healthReportedAt: tstz('health_reported_at'),
    removedAt: tstz('removed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('devices_account_idx').on(table.accountId, table.createdAt),
    index('devices_presence_idx').on(table.status, table.lastSeenAt),
  ],
);

export const deviceSims = pgTable(
  'device_sims',
  {
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    slot: integer('slot').notNull(),
    carrier: text('carrier'),
    phoneNumber: text('phone_number'),
    iccid: text('iccid'),
    signalLevel: integer('signal_level'),
    enabled: boolean('enabled').notNull().default(true),
    present: boolean('present').notNull().default(true),
    dailyLimit: integer('daily_limit'),
    reportedSentToday: integer('reported_sent_today').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.deviceId, table.slot] })],
);
