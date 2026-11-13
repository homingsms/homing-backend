import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { AppConfig } from '@/config/app-config.service';
import { newId } from '@/common/ids';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/database.types';
import { webhookDeliveries, webhookEndpoints, webhookEvents } from '@/database/schema';
import { TEST_EVENT_TYPE, WEBHOOK_QUEUE, type WebhookEnvelope } from './domain/event-types';
import { toDeliveryResponse, type WebhookDeliveryResponse } from './entities/webhook.entity';

export interface DeliveryJob {
  deliveryId: string;
}

@Injectable()
export class WebhookEventsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue<DeliveryJob>,
  ) {}

  async sendTest(accountId: string, endpointId: string): Promise<WebhookDeliveryResponse> {
    await this.assertEndpoint(accountId, endpointId);
    const envelope: WebhookEnvelope = {
      id: newId('evt'),
      type: TEST_EVENT_TYPE,
      createdAt: new Date().toISOString(),
      accountId,
      data: { endpointId, message: 'This is a test event from Homing Cloud.' },
    };
    const [deliveryId] = await this.database.db.transaction((tx) => this.storeEvent(tx, envelope, [endpointId]));
    await this.enqueue(deliveryId!, deliveryId!);
    return this.describe(deliveryId!);
  }

  async redeliver(accountId: string, endpointId: string, deliveryId: string): Promise<WebhookDeliveryResponse> {
    await this.assertEndpoint(accountId, endpointId);
    const [row] = await this.database.db
      .update(webhookDeliveries)
      .set({ status: 'pending', attempts: 0, nextAttemptAt: null, updatedAt: new Date() })
      .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.endpointId, endpointId)))
      .returning({ id: webhookDeliveries.id });
    if (!row) {
      throw new NotFoundException('Delivery not found');
    }
    await this.enqueue(row.id, `${row.id}-${nanoid(8)}`);
    return this.describe(row.id);
  }

  async storeEvent(executor: DbExecutor, envelope: WebhookEnvelope, endpointIds: string[]): Promise<string[]> {
    const deliveryIds = endpointIds.map(() => newId('whd'));
    await executor.insert(webhookEvents).values({
      id: envelope.id,
      accountId: envelope.accountId,
      type: envelope.type,
      payload: { ...envelope },
      createdAt: new Date(envelope.createdAt),
    });
    await executor.insert(webhookDeliveries).values(
      endpointIds.map((endpointId, index) => ({
        id: deliveryIds[index]!,
        endpointId,
        eventId: envelope.id,
      })),
    );
    return deliveryIds;
  }

  async enqueue(deliveryId: string, jobId: string): Promise<void> {
    await this.queue.add(
      'deliver',
      { deliveryId },
      {
        jobId,
        attempts: this.config.get('WEBHOOK_MAX_ATTEMPTS'),
        backoff: { type: 'exponential', delay: this.config.get('WEBHOOK_BACKOFF_MS') },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    );
  }

  private async assertEndpoint(accountId: string, endpointId: string): Promise<void> {
    const [row] = await this.database.db
      .select({ id: webhookEndpoints.id })
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.accountId, accountId)))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Webhook not found');
    }
  }

  private async describe(deliveryId: string): Promise<WebhookDeliveryResponse> {
    const [row] = await this.database.db
      .select({ delivery: webhookDeliveries, type: webhookEvents.type })
      .from(webhookDeliveries)
      .innerJoin(webhookEvents, eq(webhookEvents.id, webhookDeliveries.eventId))
      .where(eq(webhookDeliveries.id, deliveryId))
      .limit(1);
    return toDeliveryResponse(row!.delivery, row!.type);
  }
}
