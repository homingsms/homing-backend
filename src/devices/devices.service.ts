import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import { DatabaseService } from '@/database/database.service';
import type { Transaction } from '@/database/database.types';
import { deviceSims, devices, messages } from '@/database/schema';
import { loadMessageResponses, recordMessageEvents } from '@/messages/message-query';
import { PushService } from '@/push/push.service';
import { WebhookOutbox } from '@/webhooks/webhook-outbox.service';
import { DeviceCapacityService } from './device-capacity.service';
import type { StatusPolicy } from './domain/device-status';
import type { UpdateDeviceDto } from './dto/update-device.dto';
import { type DeviceResponse, toDeviceResponse } from './entities/device.entity';

const DEVICE_REMOVED_CODE = 'device_removed';
const DEVICE_REMOVED_MESSAGE = 'The device this message was pinned to was removed';

@Injectable()
export class DevicesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly capacity: DeviceCapacityService,
    private readonly push: PushService,
    private readonly outbox: WebhookOutbox,
    private readonly config: AppConfig,
  ) {}

  private statusPolicy(): StatusPolicy {
    return {
      lowBatteryPercent: this.config.get('LOW_BATTERY_PERCENT'),
      staleAfterSeconds: this.config.staleHeartbeatSeconds,
    };
  }

  async list(accountId: string): Promise<DeviceResponse[]> {
    const snapshots = await this.capacity.load({ accountId });
    const now = new Date();
    return snapshots.map((snapshot) => toDeviceResponse(snapshot, this.statusPolicy(), now));
  }

  async get(accountId: string, id: string): Promise<DeviceResponse> {
    const snapshot = await this.capacity.loadOne(id);
    if (!snapshot || snapshot.device.accountId !== accountId) {
      throw new NotFoundException('Device not found');
    }
    return toDeviceResponse(snapshot, this.statusPolicy());
  }

  async update(accountId: string, id: string, dto: UpdateDeviceDto): Promise<DeviceResponse> {
    const settingsChanged = dto.paused !== undefined || dto.dailyLimit !== undefined || dto.sims !== undefined;
    await this.database.db.transaction(async (tx) => {
      await this.lock(tx, accountId, id);
      for (const sim of dto.sims ?? []) {
        const updated = await tx
          .update(deviceSims)
          .set({ enabled: sim.enabled, dailyLimit: sim.dailyLimit, updatedAt: sql`${deviceSims.updatedAt}` })
          .where(and(eq(deviceSims.deviceId, id), eq(deviceSims.slot, sim.slot)))
          .returning({ slot: deviceSims.slot });
        if (updated.length === 0) {
          throw new BadRequestException([`sims: slot ${sim.slot} has not been reported by this device`]);
        }
      }
      await tx
        .update(devices)
        .set({
          name: dto.name,
          paused: dto.paused,
          dailyLimit: dto.dailyLimit,
          settingsVersion: settingsChanged ? sql`${devices.settingsVersion} + 1` : undefined,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, id));
    });
    if (settingsChanged) {
      await this.push.wakeDevices([id], 'settings_changed');
    }
    return this.get(accountId, id);
  }

  async remove(accountId: string, id: string): Promise<void> {
    const now = new Date();
    const { fcmToken } = await this.database.db.transaction(async (tx) => {
      const device = await this.lock(tx, accountId, id);
      const failed = await tx
        .update(messages)
        .set({
          state: 'failed',
          errorCode: DEVICE_REMOVED_CODE,
          errorMessage: DEVICE_REMOVED_MESSAGE,
          failedAt: now,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(and(eq(messages.requestedDeviceId, id), inArray(messages.state, ['scheduled', 'pending', 'leased'])))
        .returning({ id: messages.id });
      const requeued = await tx
        .update(messages)
        .set({ state: 'pending', deviceId: null, simSlot: null, leaseExpiresAt: null, updatedAt: now })
        .where(and(eq(messages.deviceId, id), eq(messages.state, 'leased'), isNull(messages.requestedDeviceId)))
        .returning({ id: messages.id });
      await tx
        .update(messages)
        .set({ deviceId: null, updatedAt: now })
        .where(and(eq(messages.deviceId, id), eq(messages.state, 'pending'), isNull(messages.requestedDeviceId)));
      await recordMessageEvents(tx, [
        ...failed.map((row) => ({
          messageId: row.id,
          state: 'failed' as const,
          at: now,
          deviceId: id,
          errorCode: DEVICE_REMOVED_CODE,
          errorMessage: DEVICE_REMOVED_MESSAGE,
        })),
        ...requeued.map((row) => ({ messageId: row.id, state: 'pending' as const, at: now })),
      ]);
      await tx
        .update(devices)
        .set({
          removedAt: now,
          status: 'offline',
          tokenHash: `removed:${device.id}`,
          fcmToken: null,
          updatedAt: now,
        })
        .where(eq(devices.id, id));
      const failedMessages = await loadMessageResponses(
        tx,
        failed.map((row) => row.id),
      );
      await this.outbox.add(
        tx,
        failedMessages.map((message) => ({ accountId, type: 'message.failed' as const, data: { message } })),
      );
      return { fcmToken: device.fcmToken };
    });

    await this.push.wake({ id, fcmToken }, 'device_removed');
  }

  private async lock(tx: Transaction, accountId: string, id: string) {
    const [device] = await tx
      .select()
      .from(devices)
      .where(and(eq(devices.id, id), eq(devices.accountId, accountId), isNull(devices.removedAt)))
      .for('update');
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }
}
