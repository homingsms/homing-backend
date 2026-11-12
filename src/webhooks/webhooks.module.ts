import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WEBHOOK_QUEUE } from './domain/event-types';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { WebhookEventsService } from './webhook-events.service';
import { WebhookSender } from './webhook-sender';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [BullModule.registerQueue({ name: WEBHOOK_QUEUE })],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookEventsService, WebhookSender, WebhookDeliveryProcessor],
  exports: [WebhookEventsService],
})
export class WebhooksModule {}
