import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentPrincipal, RequireRole, RequireScope } from '@/common/auth/auth.decorators';
import type { Principal } from '@/common/auth/principal';
import { DevicesService } from './devices.service';
import { CreatePairingCodeDto } from './dto/create-pairing-code.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import type { DeviceResponse } from './entities/device.entity';
import { type PairingCodeResponse, PairingService } from './pairing.service';

@RequireScope('devices:manage')
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly pairing: PairingService,
  ) {}

  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<{ data: DeviceResponse[] }> {
    return { data: await this.devices.list(principal.accountId) };
  }

  @RequireRole('admin')
  @Post('pairing-codes')
  createPairingCode(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreatePairingCodeDto,
  ): Promise<PairingCodeResponse> {
    return this.pairing.createCode(principal.accountId, dto);
  }

  @Get(':deviceId')
  get(@CurrentPrincipal() principal: Principal, @Param('deviceId') id: string): Promise<DeviceResponse> {
    return this.devices.get(principal.accountId, id);
  }

  @RequireRole('admin')
  @Patch(':deviceId')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('deviceId') id: string,
    @Body() dto: UpdateDeviceDto,
  ): Promise<DeviceResponse> {
    return this.devices.update(principal.accountId, id, dto);
  }

  @RequireRole('admin')
  @Delete(':deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentPrincipal() principal: Principal, @Param('deviceId') id: string): Promise<void> {
    return this.devices.remove(principal.accountId, id);
  }
}
