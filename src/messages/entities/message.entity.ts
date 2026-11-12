import { toIso } from '@/common/dates';
import type { messageEvents, messages } from '@/database/schema';

export type MessageRow = typeof messages.$inferSelect;
export type MessageEventRow = typeof messageEvents.$inferSelect;

export interface AttachmentMeta {
  id: string;
  contentType: string;
  name: string | null;
  size: number;
}

export interface MessageErrorResponse {
  code: string;
  message: string;
}

export interface MessageResponse {
  id: string;
  type: MessageRow['type'];
  to: string;
  text: string | null;
  data: string | null;
  port: number | null;
  subject: string | null;
  attachments: AttachmentMeta[];
  state: MessageRow['state'];
  priority: MessageRow['priority'];
  deviceId: string | null;
  simSlot: number | null;
  idempotencyKey: string | null;
  scheduleAt: string | null;
  validUntil: string | null;
  deliveryReport: boolean;
  metadata: Record<string, string>;
  attempts: number;
  partsCount: number | null;
  error: MessageErrorResponse | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
}

export interface MessageEventResponse {
  state: MessageRow['state'];
  at: string;
  deviceId: string | null;
  simSlot: number | null;
  error: MessageErrorResponse | null;
}

export interface MessageDetailResponse extends MessageResponse {
  events: MessageEventResponse[];
}

function toError(code: string | null, message: string | null): MessageErrorResponse | null {
  return code ? { code, message: message ?? code } : null;
}

export function toMessageResponse(row: MessageRow, attachments: AttachmentMeta[]): MessageResponse {
  return {
    id: row.id,
    type: row.type,
    to: row.to,
    text: row.text,
    data: row.data,
    port: row.port,
    subject: row.subject,
    attachments,
    state: row.state,
    priority: row.priority,
    deviceId: row.deviceId,
    simSlot: row.simSlot,
    idempotencyKey: row.idempotencyKey,
    scheduleAt: toIso(row.scheduleAt),
    validUntil: toIso(row.validUntil),
    deliveryReport: row.deliveryReport,
    metadata: row.metadata,
    attempts: row.attempts,
    partsCount: row.partsCount,
    error: toError(row.errorCode, row.errorMessage),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sentAt: toIso(row.sentAt),
    deliveredAt: toIso(row.deliveredAt),
    failedAt: toIso(row.failedAt),
  };
}

export function toMessageEventResponse(row: MessageEventRow): MessageEventResponse {
  return {
    state: row.state,
    at: row.at.toISOString(),
    deviceId: row.deviceId,
    simSlot: row.simSlot,
    error: toError(row.errorCode, row.errorMessage),
  };
}
