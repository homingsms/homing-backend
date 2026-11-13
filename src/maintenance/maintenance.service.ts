import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, eq, inArray, lt, lte } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import { DatabaseService } from '@/database/database.service';
import { messages } from '@/database/schema';
import { PresenceService } from '@/devices/presence.service';
import { LeasesService } from '@/leases/leases.service';
import { DispatcherService } from '@/messages/dispatcher.service';
import { AccountDeletionService } from '@/accounts/account-deletion.service';
import { loadMessageResponses, recordMessageEvents } from '@/messages/message-query';
import { WebhookOutbox } from '@/webhooks/webhook-outbox.service';

const SWEEP_LOCK_KEY = 7_010_001;
const ROUTE_BATCH = 500;

export interface SweepReport {
  promoted: number;
  expired: number;
  requeued: number;
  leaseFailed: number;
  offline: number;
  routed: number;
  purged: number;
}

@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MaintenanceService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
    private readonly leases: LeasesService,
    private readonly presence: PresenceService,
    private readonly dispatcher: DispatcherService,
    private readonly outbox: WebhookOutbox,
    private readonly accountDeletion: AccountDeletionService,
  ) {}

  onApplicationBootstrap(): void {
    const interval = this.config.get('MAINTENANCE_INTERVAL_MS');
    if (interval > 0) {
      this.timer = setInterval(() => void this.tick(), interval);
      this.timer.unref();
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async sweep(now: Date = new Date()): Promise<SweepReport | null> {
    const reserved = await this.database.client.reserve();
    try {
      const [lock] = await reserved<{ locked: boolean }[]>`select pg_try_advisory_lock(${SWEEP_LOCK_KEY}) as locked`;
      if (!lock?.locked) {
        return null;
      }
      try {
        return await this.runSweep(now);
      } finally {
        await reserved`select pg_advisory_unlock(${SWEEP_LOCK_KEY})`;
      }
    } finally {
      reserved.release();
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.sweep();
    } catch (error) {
      this.logger.error(`Maintenance sweep failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async runSweep(now: Date): Promise<SweepReport> {
    const promoted = await this.promoteScheduled(now);
    const expired = await this.expireValidity(now);
    const leases = await this.leases.expireLeases(now);
    const offline = await this.presence.markStaleOffline(now);
    for (const [accountId, ids] of this.groupByAccount([...promoted, ...leases.requeued])) {
      await this.dispatcher.dispatch(accountId, ids);
    }
    const routed = await this.dispatcher.dispatchUnassigned(ROUTE_BATCH);
    const purged = await this.accountDeletion.purgePending(now);
    return {
      promoted: promoted.length,
      expired,
      requeued: leases.requeued.length,
      leaseFailed: leases.failed.length,
      offline,
      routed,
      purged,
    };
  }

  private async promoteScheduled(now: Date): Promise<{ id: string; accountId: string }[]> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(messages)
        .set({ state: 'pending', updatedAt: now })
        .where(and(eq(messages.state, 'scheduled'), lte(messages.scheduleAt, now)))
        .returning({ id: messages.id, accountId: messages.accountId });
      await recordMessageEvents(tx, rows.map((row) => ({ messageId: row.id, state: 'pending' as const, at: now })));
      return rows;
    });
  }

  private async expireValidity(now: Date): Promise<number> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(messages)
        .set({ state: 'expired', leaseExpiresAt: null, updatedAt: now })
        .where(and(inArray(messages.state, ['scheduled', 'pending']), lt(messages.validUntil, now)))
        .returning({ id: messages.id, accountId: messages.accountId });
      await recordMessageEvents(tx, rows.map((row) => ({ messageId: row.id, state: 'expired' as const, at: now })));
      const expired = await loadMessageResponses(
        tx,
        rows.map((row) => row.id),
      );
      await this.outbox.add(
        tx,
        expired.map((message) => ({
          accountId: rows.find((row) => row.id === message.id)!.accountId,
          type: 'message.expired' as const,
          data: { message },
        })),
      );
      return rows.length;
    });
  }

  private groupByAccount(rows: { id: string; accountId: string }[]): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      grouped.set(row.accountId, [...(grouped.get(row.accountId) ?? []), row.id]);
    }
    return grouped;
  }
}

