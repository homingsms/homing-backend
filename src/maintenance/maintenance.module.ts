import { Module } from '@nestjs/common';
import { DevicesModule } from '@/devices/devices.module';
import { LeasesModule } from '@/leases/leases.module';
import { MessagesModule } from '@/messages/messages.module';
import { WebhooksModule } from '@/webhooks/webhooks.module';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [DevicesModule, LeasesModule, MessagesModule, WebhooksModule],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
