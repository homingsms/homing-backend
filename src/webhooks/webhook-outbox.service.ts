import { Injectable } from '@nestjs/common';
import { newId } from '@/common/ids';
import type { DbExecutor } from '@/database/database.types';
import { webhookOutbox } from '@/database/schema';
import type { SubscribableEventType } from './domain/event-types';

export interface PendingEvent {
  accountId: string;
  type: SubscribableEventType;
  data: Record<string, unknown>;
}

@Injectable()
export class WebhookOutbox {
  async add(executor: DbExecutor, events: PendingEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await executor.insert(webhookOutbox).values(
      events.map((event) => ({
        id: newId('evt'),
        accountId: event.accountId,
        type: event.type,
        data: event.data,
      })),
    );
  }
}
