import { asc, inArray } from 'drizzle-orm';
import { newId } from '@/common/ids';
import type { DbExecutor } from '@/database/database.types';
import { messageAttachments, messageEvents, messages } from '@/database/schema';
import type { MessageState } from './domain/states';
import { type AttachmentMeta, type MessageResponse, type MessageRow, toMessageResponse } from './entities/message.entity';

export interface MessageEventInput {
  messageId: string;
  state: MessageState;
  at?: Date;
  deviceId?: string | null;
  simSlot?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export async function recordMessageEvents(executor: DbExecutor, events: MessageEventInput[]): Promise<void> {
  if (events.length === 0) {
    return;
  }
  const now = new Date();
  await executor.insert(messageEvents).values(
    events.map((event) => ({
      id: newId('mev'),
      messageId: event.messageId,
      state: event.state,
      at: event.at ?? now,
      deviceId: event.deviceId ?? null,
      simSlot: event.simSlot ?? null,
      errorCode: event.errorCode ?? null,
      errorMessage: event.errorMessage ?? null,
    })),
  );
}

export async function loadAttachmentMeta(
  executor: DbExecutor,
  messageIds: string[],
): Promise<Map<string, AttachmentMeta[]>> {
  const result = new Map<string, AttachmentMeta[]>();
  if (messageIds.length === 0) {
    return result;
  }
  const rows = await executor
    .select({
      id: messageAttachments.id,
      messageId: messageAttachments.messageId,
      contentType: messageAttachments.contentType,
      name: messageAttachments.name,
      size: messageAttachments.size,
    })
    .from(messageAttachments)
    .where(inArray(messageAttachments.messageId, messageIds))
    .orderBy(asc(messageAttachments.position));
  for (const { messageId, ...meta } of rows) {
    result.set(messageId, [...(result.get(messageId) ?? []), meta]);
  }
  return result;
}

export async function toMessageResponses(executor: DbExecutor, rows: MessageRow[]): Promise<MessageResponse[]> {
  const attachments = await loadAttachmentMeta(
    executor,
    rows.filter((row) => row.type === 'mms').map((row) => row.id),
  );
  return rows.map((row) => toMessageResponse(row, attachments.get(row.id) ?? []));
}

export async function loadMessageResponses(executor: DbExecutor, ids: string[]): Promise<MessageResponse[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await executor.select().from(messages).where(inArray(messages.id, ids));
  return toMessageResponses(executor, rows);
}
