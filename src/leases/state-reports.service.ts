import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DevicePrincipal } from '@/common/auth/principal';
import { addSeconds } from '@/common/dates';
import { DatabaseService } from '@/database/database.service';
import type { Transaction } from '@/database/database.types';
import { messages } from '@/database/schema';
import { classifyReport } from '@/messages/domain/state-machine';
import type { MessageRow } from '@/messages/entities/message.entity';
import { loadMessageResponses, recordMessageEvents } from '@/messages/message-query';
import type { SubscribableEventType } from '@/webhooks/domain/event-types';
import { WebhookEventsService } from '@/webhooks/webhook-events.service';
import type { StateReportDto } from './dto/report-states.dto';
import type { StateReportResult } from './leases.types';

const MAX_CLOCK_SKEW_SECONDS = 300;
const DEFAULT_FAILURE_CODE = 'generic_failure';

const EVENT_FOR_STATE: Partial<Record<StateReportDto['state'], SubscribableEventType>> = {
  sent: 'message.sent',
  delivered: 'message.delivered',
  failed: 'message.failed',
};

function ownsMessage(row: MessageRow, deviceId: string): boolean {
  return row.deviceId === deviceId || (row.state === 'pending' && row.lastDeviceId === deviceId);
}

@Injectable()
export class StateReportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly webhooks: WebhookEventsService,
  ) {}

  async report(principal: DevicePrincipal, reports: StateReportDto[]): Promise<StateReportResult[]> {
    const emitted: { id: string; type: SubscribableEventType }[] = [];
    const results = await this.database.db.transaction(async (tx) => {
      const output: StateReportResult[] = [];
      for (const report of reports) {
        const result = await this.apply(tx, principal, report);
        output.push(result);
        const type = EVENT_FOR_STATE[report.state];
        if (result.status === 'accepted' && type) {
          emitted.push({ id: report.messageId, type });
        }
      }
      return output;
    });

    const responses = new Map(
      (await loadMessageResponses(this.database.db, [...new Set(emitted.map((item) => item.id))])).map((message) => [
        message.id,
        message,
      ]),
    );
    for (const { id, type } of emitted) {
      const message = responses.get(id);
      if (message) {
        await this.webhooks.emit(principal.accountId, type, { message });
      }
    }
    return results;
  }

  private async apply(tx: Transaction, principal: DevicePrincipal, report: StateReportDto): Promise<StateReportResult> {
    const reject = (reason: StateReportResult['reason']): StateReportResult => ({
      messageId: report.messageId,
      status: 'rejected',
      reason,
    });
    const [row] = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.id, report.messageId), eq(messages.accountId, principal.accountId)))
      .for('update');
    if (!row) {
      return reject('not_found');
    }
    if (!ownsMessage(row, principal.id)) {
      return reject('not_leased_to_device');
    }
    const outcome = classifyReport(row.state, report.state);
    if (outcome.kind === 'reject') {
      return reject(outcome.reason);
    }
    if (outcome.kind === 'duplicate') {
      return { messageId: report.messageId, status: 'duplicate', reason: null };
    }

    const now = new Date();
    const latest = addSeconds(now, MAX_CLOCK_SKEW_SECONDS);
    const at = report.at > latest ? now : report.at;
    const simSlot = report.simSlot ?? row.simSlot;
    const errorCode = report.state === 'failed' ? (report.error?.code ?? DEFAULT_FAILURE_CODE) : null;
    const errorMessage = report.state === 'failed' ? (report.error?.message ?? null) : null;
    await tx
      .update(messages)
      .set({
        state: report.state,
        deviceId: principal.id,
        simSlot,
        leaseExpiresAt: null,
        partsCount: report.partsCount ?? row.partsCount,
        sentAt: report.state === 'sent' || report.state === 'delivered' ? (row.sentAt ?? at) : row.sentAt,
        deliveredAt: report.state === 'delivered' ? at : row.deliveredAt,
        failedAt: report.state === 'failed' ? at : row.failedAt,
        errorCode: errorCode ?? row.errorCode,
        errorMessage: errorMessage ?? row.errorMessage,
        updatedAt: now,
      })
      .where(eq(messages.id, row.id));
    await recordMessageEvents(tx, [
      { messageId: row.id, state: report.state, at, deviceId: principal.id, simSlot, errorCode, errorMessage },
    ]);
    return { messageId: report.messageId, status: 'accepted', reason: null };
  }
}
