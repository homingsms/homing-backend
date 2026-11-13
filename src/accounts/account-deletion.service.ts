import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, lt, notExists, sql } from 'drizzle-orm';
import { addSeconds } from '@/common/dates';
import { DatabaseService } from '@/database/database.service';
import { accountMembers, accounts, apiKeys, devices, teamInvites, users, webhookOutbox } from '@/database/schema';
import { PushService } from '@/push/push.service';
import { SessionsService } from './sessions.service';

export const ACCOUNT_NAME_MISMATCH = 'accountName does not match the account name';
const PURGE_RETRY_AFTER_SECONDS = 60;

@Injectable()
export class AccountDeletionService implements OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionService.name);
  private readonly running = new Set<Promise<void>>();

  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionsService,
    private readonly push: PushService,
  ) {}

  async request(accountId: string, confirmName: string): Promise<void> {
    const now = new Date();
    const removed = await this.database.db.transaction(async (tx) => {
      const [account] = await tx
        .select({ name: accounts.name })
        .from(accounts)
        .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)))
        .for('update');
      if (!account) {
        throw new NotFoundException('Account not found');
      }
      if (account.name !== confirmName) {
        throw new BadRequestException([ACCOUNT_NAME_MISMATCH]);
      }
      await tx.update(accounts).set({ deletedAt: now, updatedAt: now }).where(eq(accounts.id, accountId));
      await tx
        .update(apiKeys)
        .set({ revokedAt: now })
        .where(and(eq(apiKeys.accountId, accountId), isNull(apiKeys.revokedAt)));
      const removedDevices = await tx
        .select({ id: devices.id, fcmToken: devices.fcmToken })
        .from(devices)
        .where(and(eq(devices.accountId, accountId), isNull(devices.removedAt)));
      await tx
        .update(devices)
        .set({
          removedAt: now,
          status: 'offline',
          tokenHash: sql`'removed:' || ${devices.id}`,
          fcmToken: null,
          updatedAt: now,
        })
        .where(and(eq(devices.accountId, accountId), isNull(devices.removedAt)));
      await tx
        .update(teamInvites)
        .set({ revokedAt: now })
        .where(and(eq(teamInvites.accountId, accountId), isNull(teamInvites.acceptedAt), isNull(teamInvites.revokedAt)));
      await tx.delete(webhookOutbox).where(eq(webhookOutbox.accountId, accountId));
      await this.sessions.revokeInAccount(tx, accountId);
      return removedDevices;
    });

    await Promise.all(removed.map((device) => this.push.wake(device, 'device_removed')));
    this.track(this.purge(accountId));
  }

  async purge(accountId: string): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const members = await tx
        .select({ userId: accountMembers.userId })
        .from(accountMembers)
        .where(eq(accountMembers.accountId, accountId));
      const deleted = await tx
        .delete(accounts)
        .where(and(eq(accounts.id, accountId), isNotNull(accounts.deletedAt)))
        .returning({ id: accounts.id });
      if (deleted.length === 0 || members.length === 0) {
        return;
      }
      await tx.delete(users).where(
        and(
          inArray(
            users.id,
            members.map((member) => member.userId),
          ),
          notExists(tx.select({ one: sql`1` }).from(accountMembers).where(eq(accountMembers.userId, users.id))),
        ),
      );
    });
  }

  async purgePending(now: Date = new Date()): Promise<number> {
    const pending = await this.database.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(lt(accounts.deletedAt, addSeconds(now, -PURGE_RETRY_AFTER_SECONDS)));
    for (const account of pending) {
      await this.purge(account.id);
    }
    return pending.length;
  }

  async onModuleDestroy(): Promise<void> {
    await this.idle();
  }

  private track(work: Promise<void>): void {
    const guarded = work.catch((error: unknown) => this.logger.error(`Account purge failed: ${String(error)}`));
    this.running.add(guarded);
    void guarded.finally(() => this.running.delete(guarded));
  }

  async idle(): Promise<void> {
    await Promise.allSettled([...this.running]);
  }
}
