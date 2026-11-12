import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { accounts, messages } from '@/database/schema';
import { DeviceCapacityService } from '@/devices/device-capacity.service';
import { PushService } from '@/push/push.service';
import { pickDevice, withUse } from './domain/router';

interface DispatchRow {
  id: string;
  priority: 'normal' | 'otp';
  requestedDeviceId: string | null;
  deviceId: string | null;
}

@Injectable()
export class DispatcherService {
  constructor(
    private readonly database: DatabaseService,
    private readonly capacity: DeviceCapacityService,
    private readonly push: PushService,
  ) {}

  async dispatch(accountId: string, messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) {
      return;
    }
    const rows: DispatchRow[] = await this.database.db
      .select({
        id: messages.id,
        priority: messages.priority,
        requestedDeviceId: messages.requestedDeviceId,
        deviceId: messages.deviceId,
      })
      .from(messages)
      .where(and(eq(messages.accountId, accountId), inArray(messages.id, messageIds), eq(messages.state, 'pending')))
      .orderBy(asc(messages.createdAt));

    const wake = new Map<string, boolean>();
    const mark = (deviceId: string, row: DispatchRow) => wake.set(deviceId, (wake.get(deviceId) ?? false) || row.priority === 'otp');
    for (const row of rows) {
      const target = row.requestedDeviceId ?? row.deviceId;
      if (target) {
        mark(target, row);
      }
    }
    const unassigned = rows.filter((row) => !row.deviceId && !row.requestedDeviceId);
    if (unassigned.length > 0) {
      await this.route(accountId, unassigned, mark);
    }
    await Promise.all(
      [...wake].map(([deviceId, urgent]) => this.push.wakeDevices([deviceId], 'messages_pending', urgent)),
    );
  }

  async dispatchUnassigned(limit: number): Promise<number> {
    const rows = await this.database.db
      .select({ id: messages.id, accountId: messages.accountId })
      .from(messages)
      .where(and(eq(messages.state, 'pending'), isNull(messages.deviceId), isNull(messages.requestedDeviceId)))
      .orderBy(asc(messages.createdAt))
      .limit(limit);
    const byAccount = new Map<string, string[]>();
    for (const row of rows) {
      byAccount.set(row.accountId, [...(byAccount.get(row.accountId) ?? []), row.id]);
    }
    for (const [accountId, ids] of byAccount) {
      await this.dispatch(accountId, ids);
    }
    return rows.length;
  }

  private async route(
    accountId: string,
    rows: DispatchRow[],
    mark: (deviceId: string, row: DispatchRow) => void,
  ): Promise<void> {
    const [account] = await this.database.db
      .select({ strategy: accounts.routingStrategy, last: accounts.lastRoutedDeviceId })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    if (!account) {
      return;
    }
    let devices = (await this.capacity.load({ accountId })).map((snapshot) => snapshot.capacity);
    let last = account.last;
    for (const row of rows) {
      const device = pickDevice(devices, account.strategy, last);
      if (!device) {
        break;
      }
      const updated = await this.database.db
        .update(messages)
        .set({ deviceId: device.id, updatedAt: new Date() })
        .where(and(eq(messages.id, row.id), eq(messages.state, 'pending'), isNull(messages.deviceId)))
        .returning({ id: messages.id });
      if (updated.length > 0) {
        mark(device.id, row);
        devices = devices.map((candidate) => (candidate.id === device.id ? withUse(candidate, null) : candidate));
        last = device.id;
      }
    }
    if (last !== account.last) {
      await this.database.db.update(accounts).set({ lastRoutedDeviceId: last }).where(eq(accounts.id, accountId));
    }
  }
}
