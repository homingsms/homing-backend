import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentDevice, DeviceAuth } from '@/common/auth/auth.decorators';
import type { DevicePrincipal } from '@/common/auth/principal';
import { PushInboxDto } from './dto/push-inbox.dto';
import { type InboxPushResult, InboxService } from './inbox.service';

@DeviceAuth()
@Controller('device/inbox')
export class DeviceInboxController {
  constructor(private readonly inbox: InboxService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async push(@CurrentDevice() device: DevicePrincipal, @Body() dto: PushInboxDto): Promise<{ results: InboxPushResult[] }> {
    return { results: await this.inbox.ingest(device, dto.messages) };
  }
}
