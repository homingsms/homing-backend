import { Injectable, UnauthorizedException } from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { AppConfig } from '@/config/app-config.service';
import type { DevicePrincipal } from '@/common/auth/principal';
import { addSeconds } from '@/common/dates';
import { DatabaseService } from '@/database/database.service';
import { deviceSims, devices, messages } from '@/database/schema';
import { WebhookEventsService } from '@/webhooks/webhook-events.service';
import { buildDeviceSettings, type DeviceSettingsResponse } from './device-settings';
import type { FcmTokenDto, HeartbeatDto } from './dto/heartbeat.dto';
import { toDeviceEventData } from './entities/device.entity';

export interface HeartbeatResponse {
  serverTime: string;
  pendingMessages: number;
  settingsVersion: number;
}

@Injectable()
export class PresenceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfig,
    private readonly webhooks: WebhookEventsService,
  ) {}

  async heartbeat(principal: DevicePrincipal, dto: HeartbeatDto): Promise<HeartbeatResponse> {
    const now = new Date();
    const { wasOffline, device } = await this.database.db.transaction(async (tx) => {
      const [before] = await tx
        .select({ status: devices.status })
        .from(devices)
        .where(eq(devices.id, principal.id))
        .for('update');
      if (!before) {
        throw new UnauthorizedException('Device was removed');
      }
      const [updated] = await tx
        .update(devices)
        .set({
          status: 'online',
          lastSeenAt: now,
          appVersion: dto.appVersion,
          batteryLevel: dto.battery.level,
          charging: dto.battery.charging,
          networkType: dto.network.type,
          localQueueSize: dto.localQueueSize ?? null,
          healthReportedAt: now,
          updatedAt: now,
        })
        .where(eq(devices.id, principal.id))
        .returning();
      if (dto.sims.length > 0) {
        await tx
          .insert(deviceSims)
          .values(
            dto.sims.map((sim) => ({
              deviceId: principal.id,
              slot: sim.slot,
              carrier: sim.carrier ?? null,
              phoneNumber: sim.phoneNumber ?? null,
              signalLevel: sim.signalLevel ?? null,
              reportedSentToday: sim.sentToday ?? 0,
              present: true,
              updatedAt: now,
            })),
          )
          .onConflictDoUpdate({
            target: [deviceSims.deviceId, deviceSims.slot],
            set: {
              carrier: sql`excluded.carrier`,
              phoneNumber: sql`coalesce(excluded.phone_number, ${deviceSims.phoneNumber})`,
              signalLevel: sql`excluded.signal_level`,
              reportedSentToday: sql`excluded.reported_sent_today`,
              present: true,
              updatedAt: now,
            },
          });
      }
      const reported = dto.sims.map((sim) => sim.slot);
      await tx
        .update(deviceSims)
        .set({ present: false })
        .where(
          and(
            eq(deviceSims.deviceId, principal.id),
            reported.length > 0 ? notInArray(deviceSims.slot, reported) : undefined,
          ),
        );
      return { wasOffline: before.status === 'offline', device: updated! };
    });

    if (wasOffline) {
      await this.webhooks.emit(device.accountId, 'device.online', toDeviceEventData(device));
    }
    return {
      serverTime: now.toISOString(),
      pendingMessages: await this.pendingFor(principal),
      settingsVersion: device.settingsVersion,
    };
  }

  async pendingFor(principal: DevicePrincipal): Promise<number> {
    const [row] = await this.database.db
      .select({ total: count() })
      .from(messages)
      .where(
        and(
          eq(messages.accountId, principal.accountId),
          eq(messages.state, 'pending'),
          or(eq(messages.deviceId, principal.id), and(isNull(messages.deviceId), isNull(messages.requestedDeviceId))),
        ),
      );
    return row?.total ?? 0;
  }

  async setFcmToken(principal: DevicePrincipal, dto: FcmTokenDto): Promise<void> {
    await this.database.db
      .update(devices)
      .set({ fcmToken: dto.fcmToken, updatedAt: new Date() })
      .where(eq(devices.id, principal.id));
  }

  async settings(principal: DevicePrincipal): Promise<DeviceSettingsResponse> {
    const [device] = await this.database.db.select().from(devices).where(eq(devices.id, principal.id));
    if (!device) {
      throw new UnauthorizedException('Device was removed');
    }
    const sims = await this.database.db
      .select()
      .from(deviceSims)
      .where(and(eq(deviceSims.deviceId, principal.id), eq(deviceSims.present, true)))
      .orderBy(asc(deviceSims.slot));
    return buildDeviceSettings(device, sims, this.config);
  }

  async markStaleOffline(now: Date = new Date()): Promise<number> {
    const cutoff = addSeconds(now, -this.config.get('OFFLINE_AFTER_SECONDS'));
    const stale = await this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(devices)
        .set({ status: 'offline', updatedAt: now })
        .where(
          and(
            eq(devices.status, 'online'),
            isNull(devices.removedAt),
            or(lt(devices.lastSeenAt, cutoff), isNull(devices.lastSeenAt)),
          ),
        )
        .returning();
      if (rows.length > 0) {
        await tx
          .update(messages)
          .set({ deviceId: null, updatedAt: now })
          .where(
            and(
              eq(messages.state, 'pending'),
              isNull(messages.requestedDeviceId),
              inArray(
                messages.deviceId,
                rows.map((row) => row.id),
              ),
            ),
          );
      }
      return rows;
    });
    for (const device of stale) {
      await this.webhooks.emit(device.accountId, 'device.offline', toDeviceEventData(device));
    }
    return stale.length;
  }
}
