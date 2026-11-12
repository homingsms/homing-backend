import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lt, type SQL } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import type { DevicePrincipal } from '@/common/auth/principal';
import { newId } from '@/common/ids';
import { decodeCursor, type Page, toPage } from '@/common/pagination/cursor';
import { beforeCursor } from '@/common/pagination/keyset';
import { DatabaseService } from '@/database/database.service';
import { inboxAttachments, inboxMessages } from '@/database/schema';
import type { AttachmentMeta } from '@/messages/entities/message.entity';
import { WebhookEventsService } from '@/webhooks/webhook-events.service';
import { matchOptOut } from './domain/opt-out';
import type { ListInboxQueryDto } from './dto/list-inbox.query.dto';
import type { InboxUploadDto } from './dto/push-inbox.dto';
import { type InboxMessageResponse, type InboxRow, toInboxResponse } from './entities/inbox.entity';
import { inboxUploadErrors } from './inbox-content';

export interface InboxPushResult {
  localId: string;
  id: string;
  duplicate: boolean;
}

@Injectable()
export class InboxService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
    private readonly webhooks: WebhookEventsService,
  ) {}

  async ingest(principal: DevicePrincipal, uploads: InboxUploadDto[]): Promise<InboxPushResult[]> {
    const errors = inboxUploadErrors(uploads);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
    const created: InboxRow[] = [];
    const results = await this.database.db.transaction(async (tx) => {
      const output: InboxPushResult[] = [];
      for (const upload of uploads) {
        const [row] = await tx
          .insert(inboxMessages)
          .values({
            id: newId('inb'),
            accountId: principal.accountId,
            deviceId: principal.id,
            localId: upload.localId,
            type: upload.type,
            from: upload.from,
            to: upload.to ?? null,
            simSlot: upload.simSlot ?? null,
            text: upload.text ?? null,
            data: upload.data ?? null,
            port: upload.port ?? null,
            subject: upload.subject ?? null,
            receivedAt: upload.receivedAt,
          })
          .onConflictDoNothing({ target: [inboxMessages.deviceId, inboxMessages.localId] })
          .returning();
        if (!row) {
          const [existing] = await tx
            .select({ id: inboxMessages.id })
            .from(inboxMessages)
            .where(and(eq(inboxMessages.deviceId, principal.id), eq(inboxMessages.localId, upload.localId)));
          output.push({ localId: upload.localId, id: existing!.id, duplicate: true });
          continue;
        }
        const attachments = upload.attachments ?? [];
        if (attachments.length > 0) {
          await tx.insert(inboxAttachments).values(
            attachments.map((attachment, position) => {
              const data = Buffer.from(attachment.data, 'base64');
              return {
                id: newId('iat'),
                inboxMessageId: row.id,
                position,
                contentType: attachment.contentType,
                name: attachment.name ?? null,
                size: data.length,
                data,
              };
            }),
          );
        }
        created.push(row);
        output.push({ localId: upload.localId, id: row.id, duplicate: false });
      }
      return output;
    });
    await this.announce(created);
    return results;
  }

  async list(accountId: string, query: ListInboxQueryDto): Promise<Page<InboxMessageResponse>> {
    const conditions: (SQL | undefined)[] = [
      eq(inboxMessages.accountId, accountId),
      query.type ? eq(inboxMessages.type, query.type) : undefined,
      query.deviceId ? eq(inboxMessages.deviceId, query.deviceId) : undefined,
      query.from ? eq(inboxMessages.from, query.from) : undefined,
      query.receivedFrom ? gte(inboxMessages.receivedAt, query.receivedFrom) : undefined,
      query.receivedTo ? lt(inboxMessages.receivedAt, query.receivedTo) : undefined,
      beforeCursor(inboxMessages.receivedAt, inboxMessages.id, decodeCursor(query.cursor)),
    ];
    const rows = await this.database.db
      .select()
      .from(inboxMessages)
      .where(and(...conditions))
      .orderBy(desc(inboxMessages.receivedAt), desc(inboxMessages.id))
      .limit(query.limit + 1);
    const page = toPage(rows, query.limit, (row) => ({ at: row.receivedAt, id: row.id }));
    return { data: await this.describe(page.data), nextCursor: page.nextCursor };
  }

  async get(accountId: string, id: string): Promise<InboxMessageResponse> {
    const [row] = await this.database.db
      .select()
      .from(inboxMessages)
      .where(and(eq(inboxMessages.id, id), eq(inboxMessages.accountId, accountId)));
    if (!row) {
      throw new NotFoundException('Inbox message not found');
    }
    const [response] = await this.describe([row]);
    return response!;
  }

  async attachment(accountId: string, id: string, attachmentId: string) {
    const [row] = await this.database.db
      .select({ contentType: inboxAttachments.contentType, name: inboxAttachments.name, data: inboxAttachments.data })
      .from(inboxAttachments)
      .innerJoin(inboxMessages, eq(inboxMessages.id, inboxAttachments.inboxMessageId))
      .where(
        and(
          eq(inboxAttachments.id, attachmentId),
          eq(inboxAttachments.inboxMessageId, id),
          eq(inboxMessages.accountId, accountId),
        ),
      );
    if (!row) {
      throw new NotFoundException('Attachment not found');
    }
    return row;
  }

  private async describe(rows: InboxRow[]): Promise<InboxMessageResponse[]> {
    const ids = rows.filter((row) => row.type === 'mms').map((row) => row.id);
    const metas = ids.length
      ? await this.database.db
          .select({
            id: inboxAttachments.id,
            inboxMessageId: inboxAttachments.inboxMessageId,
            contentType: inboxAttachments.contentType,
            name: inboxAttachments.name,
            size: inboxAttachments.size,
          })
          .from(inboxAttachments)
          .where(inArray(inboxAttachments.inboxMessageId, ids))
          .orderBy(asc(inboxAttachments.position))
      : [];
    const byMessage = new Map<string, AttachmentMeta[]>();
    for (const { inboxMessageId, ...meta } of metas) {
      byMessage.set(inboxMessageId, [...(byMessage.get(inboxMessageId) ?? []), meta]);
    }
    return rows.map((row) => toInboxResponse(row, byMessage.get(row.id) ?? []));
  }

  private async announce(rows: InboxRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    const keywords = this.config.get('OPT_OUT_KEYWORDS');
    for (const message of await this.describe(rows)) {
      await this.webhooks.emit(rows[0]!.accountId, 'inbox.received', { message });
      const keyword = message.type === 'sms' ? matchOptOut(message.text, keywords) : null;
      if (keyword) {
        await this.webhooks.emit(rows[0]!.accountId, 'opt_out.received', {
          phoneNumber: message.from,
          keyword,
          inboxMessageId: message.id,
          deviceId: message.deviceId,
          receivedAt: message.receivedAt,
        });
      }
    }
  }
}
