import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentPrincipal, RequireRole, RequireScope } from '@/common/auth/auth.decorators';
import type { Principal } from '@/common/auth/principal';
import type { Page } from '@/common/pagination/cursor';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { ListDeliveriesQueryDto } from './dto/list-deliveries.query.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import type { WebhookDeliveryResponse, WebhookEndpointResponse } from './entities/webhook.entity';
import { WebhookEventsService } from './webhook-events.service';
import { WebhooksService } from './webhooks.service';

@RequireScope('webhooks:manage')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly events: WebhookEventsService,
  ) {}

  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<{ data: WebhookEndpointResponse[] }> {
    return { data: await this.webhooks.list(principal.accountId) };
  }

  @RequireRole('admin')
  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() dto: CreateWebhookDto) {
    return this.webhooks.create(principal.accountId, dto);
  }

  @Get(':webhookId')
  get(@CurrentPrincipal() principal: Principal, @Param('webhookId') id: string): Promise<WebhookEndpointResponse> {
    return this.webhooks.get(principal.accountId, id);
  }

  @RequireRole('admin')
  @Patch(':webhookId')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('webhookId') id: string,
    @Body() dto: UpdateWebhookDto,
  ): Promise<WebhookEndpointResponse> {
    return this.webhooks.update(principal.accountId, id, dto);
  }

  @RequireRole('admin')
  @Delete(':webhookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentPrincipal() principal: Principal, @Param('webhookId') id: string): Promise<void> {
    return this.webhooks.remove(principal.accountId, id);
  }

  @RequireRole('admin')
  @Post(':webhookId/rotate-secret')
  @HttpCode(HttpStatus.OK)
  rotate(@CurrentPrincipal() principal: Principal, @Param('webhookId') id: string): Promise<{ secret: string }> {
    return this.webhooks.rotateSecret(principal.accountId, id);
  }

  @RequireRole('admin')
  @Post(':webhookId/test')
  @HttpCode(HttpStatus.ACCEPTED)
  test(@CurrentPrincipal() principal: Principal, @Param('webhookId') id: string): Promise<WebhookDeliveryResponse> {
    return this.events.sendTest(principal.accountId, id);
  }

  @Get(':webhookId/deliveries')
  deliveries(
    @CurrentPrincipal() principal: Principal,
    @Param('webhookId') id: string,
    @Query() query: ListDeliveriesQueryDto,
  ): Promise<Page<WebhookDeliveryResponse>> {
    return this.webhooks.listDeliveries(principal.accountId, id, query);
  }

  @RequireRole('admin')
  @Post(':webhookId/deliveries/:deliveryId/redeliver')
  @HttpCode(HttpStatus.ACCEPTED)
  redeliver(
    @CurrentPrincipal() principal: Principal,
    @Param('webhookId') id: string,
    @Param('deliveryId') deliveryId: string,
  ): Promise<WebhookDeliveryResponse> {
    return this.events.redeliver(principal.accountId, id, deliveryId);
  }
}
