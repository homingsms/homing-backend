import { Module } from '@nestjs/common';
import { WebhooksModule } from '@/webhooks/webhooks.module';
import { DeviceCapacityService } from './device-capacity.service';
import { DevicePresenceController } from './device-presence.controller';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { PairingService } from './pairing.service';
import { PresenceService } from './presence.service';

@Module({
  imports: [WebhooksModule],
  controllers: [DevicesController, DevicePresenceController],
  providers: [DevicesService, DeviceCapacityService, PairingService, PresenceService],
  exports: [DeviceCapacityService, PresenceService],
})
export class DevicesModule {}
