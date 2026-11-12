import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import type { DevicePrincipal } from '@/common/auth/principal';
import { addSeconds } from '@/common/dates';
import { DatabaseService } from '@/database/database.service';
import { devices, messageAttachments, messages } from '@/database/schema';
import { DeviceCapacityService } from '@/devices/device-capacity.service';
import type { MessageRow } from '@/messages/entities/message.entity';
import { recordMessageEvents } from '@/messages/message-query';
import { DEFAULT_PULL_LIMIT } from './dto/pull-messages.dto';
import { selectForLease } from './lease-selection';
import type { DeviceMessageResponse } from './leases.types';

const CANDIDATE_HEADROOM = 50;

export interface ExpiredLeases {
  requeued: { id: string; accountId: string }[];
  failed: { id: string; accountId: string }[];
}

@Injectable()
export class LeasesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly capacity: DeviceCapacityService,
    private readonly config: AppConfig,
  ) {}

  async pull(principal: DevicePrincipal, limit: number = DEFAULT_PULL_LIMIT): Promise<DeviceMessageResponse[]> {
    const now = new Date();
    const leaseExpiresAt = addSeconds(now, this.config.get('LEASE_SECONDS'));
    const leased = await this.database.db.transaction(async (tx) => {
      await tx.update(devices).set({ lastSeenAt: now }).where(eq(devices.id, principal.id));
      const snapshot = await this.capacity.loadOne(principal.id, tx);
      if (!snapshot || snapshot.device.paused) {
        return [];
      }
      const candidates = await tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.accountId, principal.accountId),
            eq(messages.state, 'pending'),
            or(eq(messages.deviceId, principal.id), and(isNull(messages.deviceId), isNull(messages.requestedDeviceId))),
            or(isNull(messages.validUntil), gt(messages.validUntil, now)),
          ),
        )
        .orderBy(desc(messages.priority), asc(messages.createdAt))
        .limit(limit + CANDIDATE_HEADROOM)
        .for('update', { skipLocked: true });

      const chosen = selectForLease(snapshot.capacity, candidates, limit);

      const updated: MessageRow[] = [];
      for (const { candidate: row, slot } of chosen) {
        const [result] = await tx
          .update(messages)
          .set({
            state: 'leased',
            deviceId: principal.id,
            lastDeviceId: principal.id,
            simSlot: slot,
            attempts: sql`${messages.attempts} + 1`,
            leasedAt: now,
            leaseExpiresAt,
            updatedAt: now,
          })
          .where(eq(messages.id, row.id))
          .returning();
        updated.push(result!);
      }
      await recordMessageEvents(
        tx,
        updated.map((row) => ({ messageId: row.id, state: 'leased' as const, at: now, deviceId: principal.id, simSlot: row.simSlot })),
      );
      return updated;
    });
    return this.toDeviceMessages(leased);
  }

  async expireLeases(now: Date = new Date()): Promise<ExpiredLeases> {
    const maxAttempts = this.config.get('MAX_LEASE_ATTEMPTS');
    const exhausted = sql`${messages.attempts} >= ${maxAttempts}`;
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(messages)
        .set({
          state: sql`CASE WHEN ${exhausted} THEN 'failed'::message_state ELSE 'pending'::message_state END`,
          deviceId: sql`CASE WHEN ${messages.requestedDeviceId} IS NULL AND NOT (${exhausted}) THEN NULL ELSE ${messages.deviceId} END`,
          simSlot: sql`CASE WHEN ${exhausted} THEN ${messages.simSlot} ELSE NULL END`,
          errorCode: sql`CASE WHEN ${exhausted} THEN 'lease_expired' ELSE ${messages.errorCode} END`,
          errorMessage: sql`CASE WHEN ${exhausted} THEN 'No device confirmed the message in time' ELSE ${messages.errorMessage} END`,
          failedAt: sql`CASE WHEN ${exhausted} THEN ${now.toISOString()}::timestamptz ELSE ${messages.failedAt} END`,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(and(eq(messages.state, 'leased'), lt(messages.leaseExpiresAt, now)))
        .returning({ id: messages.id, accountId: messages.accountId, state: messages.state, deviceId: messages.lastDeviceId });
      await recordMessageEvents(
        tx,
        rows.map((row) => ({
          messageId: row.id,
          state: row.state,
          at: now,
          deviceId: row.deviceId,
          errorCode: row.state === 'failed' ? 'lease_expired' : null,
          errorMessage: row.state === 'failed' ? 'No device confirmed the message in time' : null,
        })),
      );
      return {
        requeued: rows.filter((row) => row.state === 'pending'),
        failed: rows.filter((row) => row.state === 'failed'),
      };
    });
  }

  private async toDeviceMessages(rows: MessageRow[]): Promise<DeviceMessageResponse[]> {
    const mmsIds = rows.filter((row) => row.type === 'mms').map((row) => row.id);
    const attachments = mmsIds.length
      ? await this.database.db
          .select()
          .from(messageAttachments)
          .where(inArray(messageAttachments.messageId, mmsIds))
          .orderBy(asc(messageAttachments.position))
      : [];
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      to: row.to,
      text: row.text,
      data: row.data,
      port: row.port,
      subject: row.subject,
      attachments: attachments
        .filter((attachment) => attachment.messageId === row.id)
        .map((attachment) => ({
          contentType: attachment.contentType,
          name: attachment.name,
          data: attachment.data.toString('base64'),
        })),
      simSlot: row.simSlot,
      priority: row.priority,
      deliveryReport: row.deliveryReport,
      validUntil: row.validUntil?.toISOString() ?? null,
      attempt: row.attempts,
      leaseExpiresAt: row.leaseExpiresAt!.toISOString(),
    }));
  }
}
