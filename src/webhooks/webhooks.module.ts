import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WEBHOOK_QUEUE } from './domain/event-types';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { WebhookEventsService } from './webhook-events.service';
import { WebhookOutboxDispatcher } from './webhook-outbox.dispatcher';
import { WebhookOutbox } from './webhook-outbox.service';
import { systemResolver } from './domain/url-policy';
import { WEBHOOK_DNS_RESOLVER, WebhookSender } from './webhook-sender';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [BullModule.registerQueue({ name: WEBHOOK_QUEUE })],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhookEventsService,
    WebhookSender,
    { provide: WEBHOOK_DNS_RESOLVER, useValue: systemResolver },
    WebhookDeliveryProcessor,
    WebhookOutbox,
    WebhookOutboxDispatcher,
  ],
  exports: [WebhookEventsService, WebhookOutbox, WebhookOutboxDispatcher],
})
export class WebhooksModule {}
