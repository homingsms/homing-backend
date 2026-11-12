import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentDevice, DeviceAuth } from '@/common/auth/auth.decorators';
import type { DevicePrincipal } from '@/common/auth/principal';
import { PullMessagesDto } from './dto/pull-messages.dto';
import { ReportStatesDto } from './dto/report-states.dto';
import { LeasesService } from './leases.service';
import type { DeviceMessageResponse, StateReportResult } from './leases.types';
import { StateReportsService } from './state-reports.service';

@DeviceAuth()
@Controller('device/messages')
export class DeviceMessagesController {
  constructor(
    private readonly leases: LeasesService,
    private readonly reports: StateReportsService,
  ) {}

  @Post('pull')
  @HttpCode(HttpStatus.OK)
  async pull(
    @CurrentDevice() device: DevicePrincipal,
    @Body() dto: PullMessagesDto,
  ): Promise<{ messages: DeviceMessageResponse[] }> {
    return { messages: await this.leases.pull(device, dto.limit) };
  }

  @Post('states')
  @HttpCode(HttpStatus.OK)
  async report(
    @CurrentDevice() device: DevicePrincipal,
    @Body() dto: ReportStatesDto,
  ): Promise<{ results: StateReportResult[] }> {
    return { results: await this.reports.report(device, dto.reports) };
  }
}
