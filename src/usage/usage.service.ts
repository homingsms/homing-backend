import { Injectable } from '@nestjs/common';
import { and, count, eq, gte, inArray, isNull, lt, type SQL, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { addDays, startOfUtcDay } from '@/common/dates';
import { DatabaseService } from '@/database/database.service';
import { devices, inboxMessages, messages } from '@/database/schema';
import { IN_FLIGHT_STATES } from '@/messages/domain/states';
import type { DailyUsageQueryDto, UsageRangeQueryDto } from './dto/usage-range.query.dto';
import { resolveRange, type UsageRange } from './usage-range';

type Metric = 'sent' | 'delivered' | 'failed' | 'received';
type Counts = Record<Metric, number>;

interface MetricSource {
  metric: Metric;
  time: PgColumn;
  account: PgColumn;
  device: PgColumn;
}

const SOURCES: MetricSource[] = [
  { metric: 'sent', time: messages.sentAt, account: messages.accountId, device: messages.deviceId },
  { metric: 'delivered', time: messages.deliveredAt, account: messages.accountId, device: messages.deviceId },
  { metric: 'failed', time: messages.failedAt, account: messages.accountId, device: messages.deviceId },
  { metric: 'received', time: inboxMessages.receivedAt, account: inboxMessages.accountId, device: inboxMessages.deviceId },
];

const zero = (): Counts => ({ sent: 0, delivered: 0, failed: 0, received: 0 });

@Injectable()
export class UsageService {
  constructor(private readonly database: DatabaseService) {}

  async daily(accountId: string, query: DailyUsageQueryDto) {
    const range = resolveRange(query.from, query.to);
    const rows = new Map(range.days.map((day) => [day, zero()]));
    for (const source of SOURCES) {
      const day = sql<string>`to_char(${source.time} at time zone 'UTC', 'YYYY-MM-DD')`;
      const result = await this.database.db
        .select({ key: day, total: count() })
        .from(source.time.table)
        .where(this.window(source, accountId, range, query.deviceId ? eq(source.device, query.deviceId) : undefined))
        .groupBy(day);
      for (const { key, total } of result) {
        const entry = rows.get(key);
        if (entry) {
          entry[source.metric] = total;
        }
      }
    }
    return { data: range.days.map((date) => ({ date, ...rows.get(date)! })) };
  }

  async byDevice(accountId: string, query: UsageRangeQueryDto) {
    const range = resolveRange(query.from, query.to);
    const current = await this.database.db
      .select({ id: devices.id, name: devices.name })
      .from(devices)
      .where(and(eq(devices.accountId, accountId), isNull(devices.removedAt)))
      .orderBy(devices.createdAt);
    const rows = new Map(current.map((device) => [device.id, zero()]));
    const ids = current.map((device) => device.id);
    for (const source of ids.length > 0 ? SOURCES : []) {
      const result = await this.database.db
        .select({ key: source.device, total: count() })
        .from(source.time.table)
        .where(this.window(source, accountId, range, inArray(source.device, ids)))
        .groupBy(source.device);
      for (const { key, total } of result) {
        const entry = typeof key === 'string' ? rows.get(key) : undefined;
        if (entry) {
          entry[source.metric] = total;
        }
      }
    }
    return { data: current.map((device) => ({ deviceId: device.id, deviceName: device.name, ...rows.get(device.id)! })) };
  }

  async summary(accountId: string) {
    const start = startOfUtcDay(new Date());
    const range: UsageRange = { start, endExclusive: addDays(start, 1), days: [] };
    const today = zero();
    for (const source of SOURCES) {
      const [row] = await this.database.db
        .select({ total: count() })
        .from(source.time.table)
        .where(this.window(source, accountId, range));
      today[source.metric] = row?.total ?? 0;
    }
    const queue = await this.database.db
      .select({ state: messages.state, total: count() })
      .from(messages)
      .where(and(eq(messages.accountId, accountId), inArray(messages.state, ['scheduled', 'pending', ...IN_FLIGHT_STATES])))
      .groupBy(messages.state);
    const fleet = await this.database.db
      .select({ status: devices.status, total: count() })
      .from(devices)
      .where(and(eq(devices.accountId, accountId), isNull(devices.removedAt)))
      .groupBy(devices.status);
    const queued = (states: readonly string[]) =>
      queue.filter((row) => states.includes(row.state)).reduce((sum, row) => sum + row.total, 0);
    return {
      today,
      queue: { scheduled: queued(['scheduled']), pending: queued(['pending']), inFlight: queued(IN_FLIGHT_STATES) },
      devices: {
        online: fleet.find((row) => row.status === 'online')?.total ?? 0,
        total: fleet.reduce((sum, row) => sum + row.total, 0),
      },
    };
  }

  private window(source: MetricSource, accountId: string, range: UsageRange, extra?: SQL): SQL | undefined {
    return and(eq(source.account, accountId), gte(source.time, range.start), lt(source.time, range.endExclusive), extra);
  }
}
