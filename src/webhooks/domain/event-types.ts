export const SUBSCRIBABLE_EVENT_TYPES = [
  'message.sent',
  'message.delivered',
  'message.failed',
  'message.cancelled',
  'message.expired',
  'inbox.received',
  'device.online',
  'device.offline',
  'opt_out.received',
] as const;

export const TEST_EVENT_TYPE = 'webhook.test';

export const WEBHOOK_EVENT_TYPES = [...SUBSCRIBABLE_EVENT_TYPES, TEST_EVENT_TYPE] as const;

export type SubscribableEventType = (typeof SUBSCRIBABLE_EVENT_TYPES)[number];
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookEnvelope<T = Record<string, unknown>> {
  id: string;
  type: WebhookEventType;
  createdAt: string;
  accountId: string;
  data: T;
}

export const WEBHOOK_QUEUE = 'webhooks';
export const WEBHOOK_USER_AGENT = 'HomingCloud-Webhooks/1.0';
export const WEBHOOK_SECRET_PREFIX = 'whsec_';
export const SIGNATURE_HEADER = 'Homing-Signature';
export const EVENT_ID_HEADER = 'Homing-Event-Id';
export const EVENT_TYPE_HEADER = 'Homing-Event-Type';
export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const RESPONSE_BODY_LIMIT = 1024;
