import { Module } from '@nestjs/common';
import { WebhooksModule } from '@/webhooks/webhooks.module';
import { DeviceInboxController } from './device-inbox.controller';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  imports: [WebhooksModule],
  controllers: [InboxController, DeviceInboxController],
  providers: [InboxService],
})
export class InboxModule {}
