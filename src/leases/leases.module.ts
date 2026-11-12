import { Module } from '@nestjs/common';
import { DevicesModule } from '@/devices/devices.module';
import { WebhooksModule } from '@/webhooks/webhooks.module';
import { DeviceMessagesController } from './device-messages.controller';
import { LeasesService } from './leases.service';
import { StateReportsService } from './state-reports.service';

@Module({
  imports: [DevicesModule, WebhooksModule],
  controllers: [DeviceMessagesController],
  providers: [LeasesService, StateReportsService],
  exports: [LeasesService],
})
export class LeasesModule {}
