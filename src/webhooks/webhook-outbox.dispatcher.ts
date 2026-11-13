import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { addSeconds } from '@/common/dates';
import { AppConfig } from '@/config/app-config.service';
import { DatabaseService } from '@/database/database.service';
import { webhookDeliveries, webhookEndpoints, webhookOutbox } from '@/database/schema';
import type { SubscribableEventType } from './domain/event-types';
import { WebhookEventsService } from './webhook-events.service';

const STALLED_AFTER_SECONDS = 60;
const RECOVERY_INTERVAL_MS = 30_000;
const RECOVERY_BATCH = 500;

export interface DispatchResult {
  events: number;
  deliveries: number;
}

@Injectable()
export class WebhookOutboxDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WebhookOutboxDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private lastRecovery = 0;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
    private readonly events: WebhookEventsService,
  ) {}

  onApplicationBootstrap(): void {
    const interval = this.config.get('WEBHOOK_OUTBOX_INTERVAL_MS');
    if (interval > 0) {
      this.timer = setInterval(() => this.tick(), interval);
      this.timer.unref();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.running;
  }

  private tick(): void {
    if (this.running) {
      return;
    }
    this.running = this.drain()
      .catch((error: unknown) => this.logger.error(`Webhook outbox dispatch failed: ${String(error)}`))
      .finally(() => {
        this.running = null;
      });
  }

  private async drain(): Promise<void> {
    const batch = this.config.get('WEBHOOK_OUTBOX_BATCH');
    while ((await this.dispatchPending(batch)).events >= batch) {
      continue;
    }
    if (Date.now() - this.lastRecovery >= RECOVERY_INTERVAL_MS) {
      this.lastRecovery = Date.now();
      await this.recoverStalled();
    }
  }

  async dispatchPending(limit: number = this.config.get('WEBHOOK_OUTBOX_BATCH')): Promise<DispatchResult> {
    const { events, deliveryIds } = await this.database.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(webhookOutbox)
        .orderBy(asc(webhookOutbox.createdAt), asc(webhookOutbox.id))
        .limit(limit)
        .for('update', { skipLocked: true });
      if (rows.length === 0) {
        return { events: 0, deliveryIds: [] };
      }
      const endpoints = await tx
        .select({ id: webhookEndpoints.id, accountId: webhookEndpoints.accountId, events: webhookEndpoints.events })
        .from(webhookEndpoints)
        .where(
          and(
            inArray(webhookEndpoints.accountId, [...new Set(rows.map((row) => row.accountId))]),
            eq(webhookEndpoints.enabled, true),
          ),
        );
      const created: string[] = [];
      for (const row of rows) {
        const targets = endpoints
          .filter((endpoint) => endpoint.accountId === row.accountId && endpoint.events.includes(row.type))
          .map((endpoint) => endpoint.id);
        if (targets.length === 0) {
          continue;
        }
        created.push(
          ...(await this.events.storeEvent(
            tx,
            {
              id: row.id,
              type: row.type as SubscribableEventType,
              createdAt: row.createdAt.toISOString(),
              accountId: row.accountId,
              data: row.data,
            },
            targets,
          )),
        );
      }
      await tx.delete(webhookOutbox).where(
        inArray(
          webhookOutbox.id,
          rows.map((row) => row.id),
        ),
      );
      return { events: rows.length, deliveryIds: created };
    });
    await this.enqueueAll(deliveryIds);
    return { events, deliveries: deliveryIds.length };
  }

  async recoverStalled(now: Date = new Date()): Promise<number> {
    const stalled = await this.database.db
      .select({ id: webhookDeliveries.id })
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.status, 'pending'),
          eq(webhookDeliveries.attempts, 0),
          sql`${webhookDeliveries.createdAt} = ${webhookDeliveries.updatedAt}`,
          lt(webhookDeliveries.createdAt, addSeconds(now, -STALLED_AFTER_SECONDS)),
        ),
      )
      .limit(RECOVERY_BATCH);
    await this.enqueueAll(stalled.map((row) => row.id));
    return stalled.length;
  }

  private async enqueueAll(deliveryIds: string[]): Promise<void> {
    for (const deliveryId of deliveryIds) {
      try {
        await this.events.enqueue(deliveryId, deliveryId);
      } catch (error) {
        this.logger.warn(`Could not queue delivery ${deliveryId}, it will be retried: ${String(error)}`);
      }
    }
  }
}
