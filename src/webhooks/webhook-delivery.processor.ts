import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import { decryptString } from '@/common/crypto/encryption';
import { DatabaseService } from '@/database/database.service';
import { webhookDeliveries, webhookEndpoints, webhookEvents } from '@/database/schema';
import { retryDelayMs } from './domain/backoff';
import {
  EVENT_ID_HEADER,
  EVENT_TYPE_HEADER,
  SIGNATURE_HEADER,
  TEST_EVENT_TYPE,
  WEBHOOK_QUEUE,
  WEBHOOK_USER_AGENT,
} from './domain/event-types';
import { buildSignatureHeader } from './domain/signature';
import type { DeliveryJob } from './webhook-events.service';
import { type SendResult, WebhookSender } from './webhook-sender';

@Processor(WEBHOOK_QUEUE, { autorun: false, concurrency: 10 })
export class WebhookDeliveryProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
    private readonly sender: WebhookSender,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.config.get('WEBHOOK_WORKER_ENABLED')) {
      this.worker.run().catch((error: unknown) => this.logger.error(`Webhook worker stopped: ${String(error)}`));
    }
  }

  async process(job: Job<DeliveryJob>): Promise<void> {
    const [context] = await this.database.db
      .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints, event: webhookEvents })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
      .innerJoin(webhookEvents, eq(webhookEvents.id, webhookDeliveries.eventId))
      .where(eq(webhookDeliveries.id, job.data.deliveryId))
      .limit(1);
    if (!context) {
      return;
    }
    const { delivery, endpoint, event } = context;
    if (!endpoint.enabled && event.type !== TEST_EVENT_TYPE) {
      await this.record(delivery.id, { ok: false, statusCode: null, body: null, error: 'Endpoint disabled' }, null, true);
      return;
    }

    const body = JSON.stringify(event.payload);
    const secret = decryptString(this.config.get('ENCRYPTION_KEY'), endpoint.secretCiphertext);
    const result = await this.sender.send(
      endpoint.url,
      body,
      {
        'Content-Type': 'application/json',
        'User-Agent': WEBHOOK_USER_AGENT,
        [EVENT_ID_HEADER]: event.id,
        [EVENT_TYPE_HEADER]: event.type,
        [SIGNATURE_HEADER]: buildSignatureHeader(secret, body, Math.floor(Date.now() / 1000)),
      },
      this.config.get('WEBHOOK_TIMEOUT_MS'),
      {
        allowHttp: this.config.get('WEBHOOK_ALLOW_HTTP'),
        allowPrivateTargets: this.config.get('WEBHOOK_ALLOW_PRIVATE_TARGETS'),
      },
    );

    const attempt = job.attemptsMade + 1;
    const final = result.ok || attempt >= (job.opts.attempts ?? 1);
    const nextAttemptAt = final
      ? null
      : new Date(Date.now() + retryDelayMs(attempt, this.config.get('WEBHOOK_BACKOFF_MS')));
    await this.record(delivery.id, result, nextAttemptAt, final);
    if (!result.ok && !final) {
      throw new Error(result.error ?? `Endpoint answered ${result.statusCode ?? 'nothing'}`);
    }
  }

  private async record(deliveryId: string, result: SendResult, nextAttemptAt: Date | null, final: boolean): Promise<void> {
    const now = new Date();
    const status = result.ok ? 'succeeded' : final ? 'failed' : 'retrying';
    await this.database.db
      .update(webhookDeliveries)
      .set({
        status,
        attempts: sql`${webhookDeliveries.attempts} + 1`,
        lastStatusCode: result.statusCode,
        lastResponseBody: result.body,
        lastError: result.error,
        nextAttemptAt,
        deliveredAt: result.ok ? now : null,
        updatedAt: now,
      })
      .where(eq(webhookDeliveries.id, deliveryId));
  }
}
