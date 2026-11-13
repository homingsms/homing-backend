import { relations } from 'drizzle-orm';
import { accountMembers, accounts, sessions, teamInvites, users } from './accounts';
import { apiKeys } from './api-keys';
import { deviceSims, devices, pairingCodes } from './devices';
import { inboxAttachments, inboxMessages } from './inbox';
import { messageAttachments, messageEvents, messages } from './messages';
import { webhookDeliveries, webhookEndpoints, webhookEvents } from './webhooks';

export const accountsRelations = relations(accounts, ({ many }) => ({
  members: many(accountMembers),
  invites: many(teamInvites),
  apiKeys: many(apiKeys),
  devices: many(devices),
  pairingCodes: many(pairingCodes),
  messages: many(messages),
  inboxMessages: many(inboxMessages),
  webhookEndpoints: many(webhookEndpoints),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(accountMembers),
  sessions: many(sessions),
}));

export const accountMembersRelations = relations(accountMembers, ({ one }) => ({
  account: one(accounts, { fields: [accountMembers.accountId], references: [accounts.id] }),
  user: one(users, { fields: [accountMembers.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  account: one(accounts, { fields: [sessions.accountId], references: [accounts.id] }),
}));

export const teamInvitesRelations = relations(teamInvites, ({ one }) => ({
  account: one(accounts, { fields: [teamInvites.accountId], references: [accounts.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  account: one(accounts, { fields: [apiKeys.accountId], references: [accounts.id] }),
}));

export const pairingCodesRelations = relations(pairingCodes, ({ one }) => ({
  account: one(accounts, { fields: [pairingCodes.accountId], references: [accounts.id] }),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  account: one(accounts, { fields: [devices.accountId], references: [accounts.id] }),
  sims: many(deviceSims),
  messages: many(messages),
}));

export const deviceSimsRelations = relations(deviceSims, ({ one }) => ({
  device: one(devices, { fields: [deviceSims.deviceId], references: [devices.id] }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  account: one(accounts, { fields: [messages.accountId], references: [accounts.id] }),
  device: one(devices, { fields: [messages.deviceId], references: [devices.id] }),
  attachments: many(messageAttachments),
  events: many(messageEvents),
}));

export const messageAttachmentsRelations = relations(messageAttachments, ({ one }) => ({
  message: one(messages, { fields: [messageAttachments.messageId], references: [messages.id] }),
}));

export const messageEventsRelations = relations(messageEvents, ({ one }) => ({
  message: one(messages, { fields: [messageEvents.messageId], references: [messages.id] }),
}));

export const inboxMessagesRelations = relations(inboxMessages, ({ one, many }) => ({
  account: one(accounts, { fields: [inboxMessages.accountId], references: [accounts.id] }),
  device: one(devices, { fields: [inboxMessages.deviceId], references: [devices.id] }),
  attachments: many(inboxAttachments),
}));

export const inboxAttachmentsRelations = relations(inboxAttachments, ({ one }) => ({
  inboxMessage: one(inboxMessages, {
    fields: [inboxAttachments.inboxMessageId],
    references: [inboxMessages.id],
  }),
}));

export const webhookEndpointsRelations = relations(webhookEndpoints, ({ one, many }) => ({
  account: one(accounts, { fields: [webhookEndpoints.accountId], references: [accounts.id] }),
  deliveries: many(webhookDeliveries),
}));

export const webhookEventsRelations = relations(webhookEvents, ({ many }) => ({
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  endpoint: one(webhookEndpoints, {
    fields: [webhookDeliveries.endpointId],
    references: [webhookEndpoints.id],
  }),
  event: one(webhookEvents, { fields: [webhookDeliveries.eventId], references: [webhookEvents.id] }),
}));
