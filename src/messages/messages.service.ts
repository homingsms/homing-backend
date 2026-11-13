import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lt, type SQL } from 'drizzle-orm';
import type { Principal } from '@/common/auth/principal';
import { newId } from '@/common/ids';
import { decodeCursor, type Page, toPage } from '@/common/pagination/cursor';
import { beforeCursor } from '@/common/pagination/keyset';
import { isUniqueViolation } from '@/common/postgres-errors';
import { DatabaseService } from '@/database/database.service';
import { devices, messageAttachments, messages } from '@/database/schema';
import { DispatcherService } from './dispatcher.service';
import { validateMessageContent } from './domain/content-rules';
import { messageRequestHash } from './domain/request-hash';
import { isCancellable } from './domain/state-machine';
import type { ListMessagesQueryDto } from './dto/list-messages.query.dto';
import type { SendMessageDto } from './dto/send-message.dto';
import type { MessageDetailResponse, MessageResponse, MessageRow } from './entities/message.entity';
import { WebhookOutbox } from '@/webhooks/webhook-outbox.service';
import { loadMessageResponses, recordMessageEvents, toMessageResponses } from './message-query';
import { MessageReaderService } from './message-reader.service';

export interface CreateResult {
  message: MessageDetailResponse;
  replayed: boolean;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly reader: MessageReaderService,
    private readonly dispatcher: DispatcherService,
    private readonly outbox: WebhookOutbox,
  ) {}

  async create(principal: Principal, dto: SendMessageDto): Promise<CreateResult> {
    const now = new Date();
    const errors = validateMessageContent(dto, now);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
    const requestHash = messageRequestHash(dto);
    if (dto.idempotencyKey) {
      const existing = await this.findByKey(principal.accountId, dto.idempotencyKey);
      if (existing) {
        return this.replay(existing, requestHash);
      }
    }
    if (dto.deviceId) {
      await this.assertDevice(principal.accountId, dto.deviceId);
    }

    const id = newId('msg');
    const scheduled = dto.scheduleAt !== undefined && dto.scheduleAt > now;
    try {
      await this.database.db.transaction(async (tx) => {
        await tx.insert(messages).values({
          id,
          accountId: principal.accountId,
          apiKeyId: principal.kind === 'apiKey' ? principal.apiKeyId : null,
          type: dto.type,
          to: dto.to,
          text: dto.text ?? null,
          data: dto.data ?? null,
          port: dto.port ?? null,
          subject: dto.subject ?? null,
          priority: dto.priority ?? 'normal',
          state: scheduled ? 'scheduled' : 'pending',
          idempotencyKey: dto.idempotencyKey ?? null,
          requestHash,
          requestedDeviceId: dto.deviceId ?? null,
          requestedSimSlot: dto.simSlot ?? null,
          deviceId: dto.deviceId ?? null,
          scheduleAt: dto.scheduleAt ?? null,
          validUntil: dto.validUntil ?? null,
          deliveryReport: dto.deliveryReport ?? true,
          metadata: dto.metadata ?? {},
        });
        const attachments = dto.attachments ?? [];
        if (attachments.length > 0) {
          await tx.insert(messageAttachments).values(
            attachments.map((attachment, position) => {
              const data = Buffer.from(attachment.data, 'base64');
              return {
                id: newId('att'),
                messageId: id,
                position,
                contentType: attachment.contentType,
                name: attachment.name ?? null,
                size: data.length,
                data,
              };
            }),
          );
        }
        await recordMessageEvents(tx, [{ messageId: id, state: scheduled ? 'scheduled' : 'pending', at: now }]);
      });
    } catch (error) {
      if (dto.idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.findByKey(principal.accountId, dto.idempotencyKey);
        if (existing) {
          return this.replay(existing, requestHash);
        }
      }
      throw error;
    }

    if (!scheduled) {
      await this.dispatcher.dispatch(principal.accountId, [id]);
    }
    return { message: await this.reader.detail(principal.accountId, id), replayed: false };
  }

  async list(accountId: string, query: ListMessagesQueryDto): Promise<Page<MessageResponse>> {
    const conditions: (SQL | undefined)[] = [
      eq(messages.accountId, accountId),
      query.state ? eq(messages.state, query.state) : undefined,
      query.type ? eq(messages.type, query.type) : undefined,
      query.deviceId ? eq(messages.deviceId, query.deviceId) : undefined,
      query.simSlot !== undefined ? eq(messages.simSlot, query.simSlot) : undefined,
      query.to ? eq(messages.to, query.to) : undefined,
      query.createdFrom ? gte(messages.createdAt, query.createdFrom) : undefined,
      query.createdTo ? lt(messages.createdAt, query.createdTo) : undefined,
      beforeCursor(messages.createdAt, messages.id, decodeCursor(query.cursor)),
    ];
    const rows = await this.database.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(query.limit + 1);
    const page = toPage(rows, query.limit, (row) => ({ at: row.createdAt, id: row.id }));
    return { data: await toMessageResponses(this.database.db, page.data), nextCursor: page.nextCursor };
  }

  get(accountId: string, id: string): Promise<MessageDetailResponse> {
    return this.reader.detail(accountId, id);
  }

  async cancel(accountId: string, id: string): Promise<MessageDetailResponse> {
    await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ state: messages.state, deviceId: messages.deviceId })
        .from(messages)
        .where(and(eq(messages.id, id), eq(messages.accountId, accountId)))
        .for('update');
      if (!row) {
        throw new NotFoundException('Message not found');
      }
      if (!isCancellable(row.state)) {
        throw new ConflictException(`Message is ${row.state} and can no longer be cancelled`);
      }
      const now = new Date();
      await tx
        .update(messages)
        .set({ state: 'cancelled', leaseExpiresAt: null, updatedAt: now })
        .where(eq(messages.id, id));
      await recordMessageEvents(tx, [{ messageId: id, state: 'cancelled', at: now, deviceId: row.deviceId }]);
      const [message] = await loadMessageResponses(tx, [id]);
      await this.outbox.add(tx, [{ accountId, type: 'message.cancelled', data: { message } }]);
    });
    return this.reader.detail(accountId, id);
  }

  private async findByKey(accountId: string, key: string): Promise<MessageRow | null> {
    const [row] = await this.database.db
      .select()
      .from(messages)
      .where(and(eq(messages.accountId, accountId), eq(messages.idempotencyKey, key)))
      .limit(1);
    return row ?? null;
  }

  private async replay(existing: MessageRow, requestHash: string): Promise<CreateResult> {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException('idempotencyKey was already used with a different request');
    }
    return { message: await this.reader.describe(existing), replayed: true };
  }

  private async assertDevice(accountId: string, deviceId: string): Promise<void> {
    const [device] = await this.database.db
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.accountId, accountId), isNull(devices.removedAt)))
      .limit(1);
    if (!device) {
      throw new NotFoundException('Device not found');
    }
  }
}
