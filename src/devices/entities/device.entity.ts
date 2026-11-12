import { toIso } from '@/common/dates';
import type { deviceSims, devices } from '@/database/schema';
import type { DeviceCapacity } from '@/messages/domain/router';

export type DeviceRow = typeof devices.$inferSelect;
export type DeviceSimRow = typeof deviceSims.$inferSelect;

export interface DeviceSnapshot {
  device: DeviceRow;
  sims: DeviceSimRow[];
  capacity: DeviceCapacity;
}

export interface SimResponse {
  slot: number;
  carrier: string | null;
  phoneNumber: string | null;
  signalLevel: number | null;
  enabled: boolean;
  dailyLimit: number | null;
  sentToday: number;
}

export interface DeviceResponse {
  id: string;
  name: string;
  status: DeviceRow['status'];
  paused: boolean;
  model: string | null;
  manufacturer: string | null;
  osVersion: string | null;
  appVersion: string | null;
  dailyLimit: number | null;
  sentToday: number;
  lastSeenAt: string | null;
  health: {
    batteryLevel: number | null;
    charging: boolean | null;
    networkType: string;
    reportedAt: string;
  } | null;
  sims: SimResponse[];
  createdAt: string;
}

export function toDeviceResponse({ device, sims, capacity }: DeviceSnapshot): DeviceResponse {
  const usage = new Map(capacity.sims.map((sim) => [sim.slot, sim.usedToday]));
  return {
    id: device.id,
    name: device.name,
    status: device.status,
    paused: device.paused,
    model: device.model,
    manufacturer: device.manufacturer,
    osVersion: device.osVersion,
    appVersion: device.appVersion,
    dailyLimit: device.dailyLimit,
    sentToday: capacity.usedToday,
    lastSeenAt: toIso(device.lastSeenAt),
    health: device.healthReportedAt
      ? {
          batteryLevel: device.batteryLevel,
          charging: device.charging,
          networkType: device.networkType ?? 'unknown',
          reportedAt: device.healthReportedAt.toISOString(),
        }
      : null,
    sims: sims.map((sim) => ({
      slot: sim.slot,
      carrier: sim.carrier,
      phoneNumber: sim.phoneNumber,
      signalLevel: sim.signalLevel,
      enabled: sim.enabled,
      dailyLimit: sim.dailyLimit,
      sentToday: usage.get(sim.slot) ?? 0,
    })),
    createdAt: device.createdAt.toISOString(),
  };
}

export function toDeviceEventData(device: DeviceRow) {
  return {
    device: {
      id: device.id,
      name: device.name,
      status: device.status,
      lastSeenAt: toIso(device.lastSeenAt),
    },
  };
}
