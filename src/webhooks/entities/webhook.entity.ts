import { toIso } from '@/common/dates';
import type { webhookDeliveries, webhookEndpoints } from '@/database/schema';
import type { SubscribableEventType, WebhookEventType } from '../domain/event-types';

export type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect;
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;

export interface WebhookEndpointResponse {
  id: string;
  url: string;
  description: string | null;
  events: SubscribableEventType[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryResponse {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: WebhookEventType;
  status: WebhookDeliveryRow['status'];
  attempts: number;
  lastStatusCode: number | null;
  lastResponseBody: string | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toEndpointResponse(row: WebhookEndpointRow): WebhookEndpointResponse {
  return {
    id: row.id,
    url: row.url,
    description: row.description,
    events: row.events as SubscribableEventType[],
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDeliveryResponse(row: WebhookDeliveryRow, eventType: string): WebhookDeliveryResponse {
  return {
    id: row.id,
    endpointId: row.endpointId,
    eventId: row.eventId,
    eventType: eventType as WebhookEventType,
    status: row.status,
    attempts: row.attempts,
    lastStatusCode: row.lastStatusCode,
    lastResponseBody: row.lastResponseBody,
    lastError: row.lastError,
    nextAttemptAt: toIso(row.nextAttemptAt),
    deliveredAt: toIso(row.deliveredAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
