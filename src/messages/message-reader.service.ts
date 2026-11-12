import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/database.types';
import { messageEvents, messages } from '@/database/schema';
import { type MessageDetailResponse, type MessageRow, toMessageEventResponse } from './entities/message.entity';
import { toMessageResponses } from './message-query';

@Injectable()
export class MessageReaderService {
  constructor(private readonly database: DatabaseService) {}

  async findRow(accountId: string, id: string, executor: DbExecutor = this.database.db): Promise<MessageRow> {
    const [row] = await executor
      .select()
      .from(messages)
      .where(and(eq(messages.id, id), eq(messages.accountId, accountId)))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Message not found');
    }
    return row;
  }

  async detail(accountId: string, id: string): Promise<MessageDetailResponse> {
    return this.describe(await this.findRow(accountId, id));
  }

  async describe(row: MessageRow): Promise<MessageDetailResponse> {
    const [[message], events] = await Promise.all([
      toMessageResponses(this.database.db, [row]),
      this.database.db
        .select()
        .from(messageEvents)
        .where(eq(messageEvents.messageId, row.id))
        .orderBy(asc(messageEvents.seq)),
    ]);
    return { ...message!, events: events.map(toMessageEventResponse) };
  }
}
