import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, gte, inArray, isNull } from 'drizzle-orm';
import { startOfUtcDay } from '@/common/dates';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/database.types';
import { deviceSims, devices, messages } from '@/database/schema';
import type { DeviceCapacity } from '@/messages/domain/router';
import type { DeviceRow, DeviceSimRow, DeviceSnapshot } from './entities/device.entity';

export type DeviceScope = { accountId: string } | { deviceId: string };

export function buildCapacity(
  device: DeviceRow,
  sims: DeviceSimRow[],
  leasedBySlot: Map<number | null, number>,
  pendingAssigned: number,
  dayStart: Date,
): DeviceCapacity {
  const cloudTotal = [...leasedBySlot.values()].reduce((sum, value) => sum + value, 0);
  const simCapacity = sims.map((sim) => ({
    slot: sim.slot,
    enabled: sim.enabled,
    dailyLimit: sim.dailyLimit,
    usedToday: Math.max(leasedBySlot.get(sim.slot) ?? 0, sim.updatedAt >= dayStart ? sim.reportedSentToday : 0),
  }));
  const usedToday = Math.max(cloudTotal, simCapacity.reduce((sum, sim) => sum + sim.usedToday, 0));
  return {
    id: device.id,
    online: device.status === 'online',
    paused: device.paused,
    dailyLimit: device.dailyLimit,
    usedToday,
    load: usedToday + pendingAssigned,
    sims: simCapacity,
  };
}

@Injectable()
export class DeviceCapacityService {
  constructor(private readonly database: DatabaseService) {}

  async load(scope: DeviceScope, executor: DbExecutor = this.database.db): Promise<DeviceSnapshot[]> {
    const deviceRows = await executor
      .select()
      .from(devices)
      .where(
        and(
          'accountId' in scope ? eq(devices.accountId, scope.accountId) : eq(devices.id, scope.deviceId),
          isNull(devices.removedAt),
        ),
      )
      .orderBy(asc(devices.createdAt), asc(devices.id));
    if (deviceRows.length === 0) {
      return [];
    }
    const ids = deviceRows.map((device) => device.id);
    const dayStart = startOfUtcDay(new Date());
    const [simRows, leased, pending] = await Promise.all([
      executor
        .select()
        .from(deviceSims)
        .where(and(inArray(deviceSims.deviceId, ids), eq(deviceSims.present, true)))
        .orderBy(asc(deviceSims.slot)),
      executor
        .select({ deviceId: messages.deviceId, simSlot: messages.simSlot, total: count() })
        .from(messages)
        .where(and(inArray(messages.deviceId, ids), gte(messages.leasedAt, dayStart)))
        .groupBy(messages.deviceId, messages.simSlot),
      executor
        .select({ deviceId: messages.deviceId, total: count() })
        .from(messages)
        .where(and(inArray(messages.deviceId, ids), eq(messages.state, 'pending')))
        .groupBy(messages.deviceId),
    ]);

    return deviceRows.map((device) => {
      const sims = simRows.filter((sim) => sim.deviceId === device.id);
      const leasedBySlot = new Map<number | null, number>();
      for (const row of leased.filter((item) => item.deviceId === device.id)) {
        leasedBySlot.set(row.simSlot, row.total);
      }
      const pendingAssigned = pending.find((item) => item.deviceId === device.id)?.total ?? 0;
      return { device, sims, capacity: buildCapacity(device, sims, leasedBySlot, pendingAssigned, dayStart) };
    });
  }

  async loadOne(deviceId: string, executor?: DbExecutor): Promise<DeviceSnapshot | null> {
    const [snapshot] = await this.load({ deviceId }, executor);
    return snapshot ?? null;
  }
}
