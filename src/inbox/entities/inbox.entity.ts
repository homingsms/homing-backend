import type { inboxMessages } from '@/database/schema';
import type { AttachmentMeta } from '@/messages/entities/message.entity';

export type InboxRow = typeof inboxMessages.$inferSelect;

export interface InboxMessageResponse {
  id: string;
  type: InboxRow['type'];
  from: string;
  to: string | null;
  deviceId: string | null;
  simSlot: number | null;
  text: string | null;
  data: string | null;
  port: number | null;
  subject: string | null;
  attachments: AttachmentMeta[];
  receivedAt: string;
  createdAt: string;
}

export function toInboxResponse(row: InboxRow, attachments: AttachmentMeta[]): InboxMessageResponse {
  return {
    id: row.id,
    type: row.type,
    from: row.from,
    to: row.to,
    deviceId: row.deviceId,
    simSlot: row.simSlot,
    text: row.text,
    data: row.data,
    port: row.port,
    subject: row.subject,
    attachments,
    receivedAt: row.receivedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
