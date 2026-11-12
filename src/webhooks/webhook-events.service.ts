import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { and, arrayContains, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { AppConfig } from '@/config/app-config.service';
import { newId } from '@/common/ids';
import { DatabaseService } from '@/database/database.service';
import { webhookDeliveries, webhookEndpoints, webhookEvents } from '@/database/schema';
import {
  type SubscribableEventType,
  TEST_EVENT_TYPE,
  WEBHOOK_QUEUE,
  type WebhookEnvelope,
  type WebhookEventType,
} from './domain/event-types';
import { toDeliveryResponse, type WebhookDeliveryResponse } from './entities/webhook.entity';

export interface DeliveryJob {
  deliveryId: string;
}

export interface PendingEvent {
  accountId: string;
  type: SubscribableEventType;
  data: Record<string, unknown>;
}

@Injectable()
export class WebhookEventsService {
  private readonly logger = new Logger(WebhookEventsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue<DeliveryJob>,
  ) {}

  async emit(accountId: string, type: SubscribableEventType, data: Record<string, unknown>): Promise<void> {
    try {
      const endpoints = await this.database.db
        .select({ id: webhookEndpoints.id })
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.accountId, accountId),
            eq(webhookEndpoints.enabled, true),
            arrayContains(webhookEndpoints.events, [type]),
          ),
        );
      if (endpoints.length === 0) {
        return;
      }
      const deliveryIds = await this.store(accountId, type, data, endpoints.map((endpoint) => endpoint.id));
      await Promise.all(deliveryIds.map((deliveryId) => this.enqueue(deliveryId, deliveryId)));
    } catch (error) {
      this.logger.error(`Could not emit ${type} for ${accountId}: ${String(error)}`);
    }
  }

  async emitAll(events: PendingEvent[]): Promise<void> {
    for (const event of events) {
      await this.emit(event.accountId, event.type, event.data);
    }
  }

  async sendTest(accountId: string, endpointId: string): Promise<WebhookDeliveryResponse> {
    await this.assertEndpoint(accountId, endpointId);
    const [deliveryId] = await this.store(
      accountId,
      TEST_EVENT_TYPE,
      { endpointId, message: 'This is a test event from Homing Cloud.' },
      [endpointId],
    );
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

  private async store(
    accountId: string,
    type: WebhookEventType,
    data: Record<string, unknown>,
    endpointIds: string[],
  ): Promise<string[]> {
    const envelope: WebhookEnvelope = {
      id: newId('evt'),
      type,
      createdAt: new Date().toISOString(),
      accountId,
      data,
    };
    const deliveryIds = endpointIds.map(() => newId('whd'));
    await this.database.db.transaction(async (tx) => {
      await tx.insert(webhookEvents).values({
        id: envelope.id,
        accountId,
        type,
        payload: { ...envelope },
      });
      await tx.insert(webhookDeliveries).values(
        endpointIds.map((endpointId, index) => ({
          id: deliveryIds[index]!,
          endpointId,
          eventId: envelope.id,
        })),
      );
    });
    return deliveryIds;
  }

  private async enqueue(deliveryId: string, jobId: string): Promise<void> {
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
