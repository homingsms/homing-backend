import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, type SQL } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import { encryptString } from '@/common/crypto/encryption';
import { randomSecret } from '@/common/crypto/secrets';
import { newId } from '@/common/ids';
import { decodeCursor, type Page, toPage } from '@/common/pagination/cursor';
import { beforeCursor } from '@/common/pagination/keyset';
import { DatabaseService } from '@/database/database.service';
import { webhookDeliveries, webhookEndpoints, webhookEvents } from '@/database/schema';
import { WEBHOOK_SECRET_PREFIX } from './domain/event-types';
import { urlProtocolError } from './domain/url-policy';
import type { CreateWebhookDto } from './dto/create-webhook.dto';
import type { ListDeliveriesQueryDto } from './dto/list-deliveries.query.dto';
import type { UpdateWebhookDto } from './dto/update-webhook.dto';
import {
  toDeliveryResponse,
  toEndpointResponse,
  type WebhookDeliveryResponse,
  type WebhookEndpointResponse,
} from './entities/webhook.entity';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
  ) {}

  async list(accountId: string): Promise<WebhookEndpointResponse[]> {
    const rows = await this.database.db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.accountId, accountId))
      .orderBy(asc(webhookEndpoints.createdAt), asc(webhookEndpoints.id));
    return rows.map(toEndpointResponse);
  }

  async get(accountId: string, id: string): Promise<WebhookEndpointResponse> {
    return toEndpointResponse(await this.find(accountId, id));
  }

  async create(accountId: string, dto: CreateWebhookDto): Promise<WebhookEndpointResponse & { secret: string }> {
    this.assertUrl(dto.url);
    const secret = this.newSecret();
    const [row] = await this.database.db
      .insert(webhookEndpoints)
      .values({
        id: newId('whk'),
        accountId,
        url: dto.url,
        description: dto.description ?? null,
        events: dto.events,
        enabled: dto.enabled ?? true,
        secretCiphertext: encryptString(this.config.get('ENCRYPTION_KEY'), secret),
      })
      .returning();
    return { ...toEndpointResponse(row!), secret };
  }

  async update(accountId: string, id: string, dto: UpdateWebhookDto): Promise<WebhookEndpointResponse> {
    await this.find(accountId, id);
    if (dto.url !== undefined) {
      this.assertUrl(dto.url);
    }
    const [row] = await this.database.db
      .update(webhookEndpoints)
      .set({
        url: dto.url,
        events: dto.events,
        description: dto.description,
        enabled: dto.enabled,
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, id))
      .returning();
    return toEndpointResponse(row!);
  }

  async remove(accountId: string, id: string): Promise<void> {
    await this.find(accountId, id);
    await this.database.db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
  }

  async rotateSecret(accountId: string, id: string): Promise<{ secret: string }> {
    await this.find(accountId, id);
    const secret = this.newSecret();
    await this.database.db
      .update(webhookEndpoints)
      .set({ secretCiphertext: encryptString(this.config.get('ENCRYPTION_KEY'), secret), updatedAt: new Date() })
      .where(eq(webhookEndpoints.id, id));
    return { secret };
  }

  async listDeliveries(
    accountId: string,
    id: string,
    query: ListDeliveriesQueryDto,
  ): Promise<Page<WebhookDeliveryResponse>> {
    await this.find(accountId, id);
    const conditions: (SQL | undefined)[] = [
      eq(webhookDeliveries.endpointId, id),
      query.status ? eq(webhookDeliveries.status, query.status) : undefined,
      beforeCursor(webhookDeliveries.createdAt, webhookDeliveries.id, decodeCursor(query.cursor)),
    ];
    const rows = await this.database.db
      .select({ delivery: webhookDeliveries, type: webhookEvents.type })
      .from(webhookDeliveries)
      .innerJoin(webhookEvents, eq(webhookEvents.id, webhookDeliveries.eventId))
      .where(and(...conditions))
      .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
      .limit(query.limit + 1);
    const page = toPage(rows, query.limit, (row) => ({ at: row.delivery.createdAt, id: row.delivery.id }));
    return { data: page.data.map((row) => toDeliveryResponse(row.delivery, row.type)), nextCursor: page.nextCursor };
  }

  private async find(accountId: string, id: string) {
    const [row] = await this.database.db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.accountId, accountId)))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Webhook not found');
    }
    return row;
  }

  private assertUrl(url: string): void {
    const error = urlProtocolError(url, {
      allowHttp: this.config.get('WEBHOOK_ALLOW_HTTP'),
      allowPrivateTargets: this.config.get('WEBHOOK_ALLOW_PRIVATE_TARGETS'),
    });
    if (error) {
      throw new BadRequestException([error]);
    }
  }

  private newSecret(): string {
    return `${WEBHOOK_SECRET_PREFIX}${randomSecret()}`;
  }
}
