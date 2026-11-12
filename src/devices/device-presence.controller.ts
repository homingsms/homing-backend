import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { CurrentDevice, DeviceAuth, Public } from '@/common/auth/auth.decorators';
import type { DevicePrincipal } from '@/common/auth/principal';
import { StrictThrottle } from '@/common/http/throttling';
import type { DeviceSettingsResponse } from './device-settings';
import { FcmTokenDto, HeartbeatDto } from './dto/heartbeat.dto';
import { PairDeviceDto } from './dto/pair-device.dto';
import { type PairResponse, PairingService } from './pairing.service';
import { type HeartbeatResponse, PresenceService } from './presence.service';

@DeviceAuth()
@Controller('device')
export class DevicePresenceController {
  constructor(
    private readonly pairing: PairingService,
    private readonly presence: PresenceService,
  ) {}

  @Public()
  @StrictThrottle()
  @Post('pair')
  pair(@Body() dto: PairDeviceDto): Promise<PairResponse> {
    return this.pairing.pair(dto);
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  heartbeat(@CurrentDevice() device: DevicePrincipal, @Body() dto: HeartbeatDto): Promise<HeartbeatResponse> {
    return this.presence.heartbeat(device, dto);
  }

  @Put('fcm-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  fcmToken(@CurrentDevice() device: DevicePrincipal, @Body() dto: FcmTokenDto): Promise<void> {
    return this.presence.setFcmToken(device, dto);
  }

  @Get('settings')
  settings(@CurrentDevice() device: DevicePrincipal): Promise<DeviceSettingsResponse> {
    return this.presence.settings(device);
  }
}
