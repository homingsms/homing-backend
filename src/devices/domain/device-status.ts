import type { DeviceCapacity } from '@/messages/domain/router';

export const DEVICE_STATUSES = ['online', 'degraded', 'offline'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const DEVICE_STATUS_REASON_CODES = [
  'paused',
  'low_battery',
  'no_network',
  'all_sims_disabled',
  'sim_no_signal',
  'device_cap_reached',
  'sim_cap_reached',
  'stale_heartbeat',
] as const;
export type DeviceStatusReasonCode = (typeof DEVICE_STATUS_REASON_CODES)[number];

export interface DeviceStatusReason {
  code: DeviceStatusReasonCode;
  simSlot: number | null;
}

export interface StatusPolicy {
  lowBatteryPercent: number;
  staleAfterSeconds: number;
}

export interface StatusInput {
  presence: 'online' | 'offline';
  paused: boolean;
  lastSeenAt: Date | null;
  batteryLevel: number | null;
  charging: boolean | null;
  networkType: string | null;
  healthReported: boolean;
  sims: { slot: number; enabled: boolean; signalLevel: number | null }[];
  capacity: Pick<DeviceCapacity, 'dailyLimit' | 'usedToday' | 'sims'>;
}

export interface DerivedStatus {
  status: DeviceStatus;
  reasons: DeviceStatusReason[];
}

const deviceWide = (code: DeviceStatusReasonCode): DeviceStatusReason => ({ code, simSlot: null });

function settingReasons(input: StatusInput): DeviceStatusReason[] {
  const reasons: DeviceStatusReason[] = [];
  if (input.paused) {
    reasons.push(deviceWide('paused'));
  }
  if (input.sims.length > 0 && input.sims.every((sim) => !sim.enabled)) {
    reasons.push(deviceWide('all_sims_disabled'));
  }
  const { dailyLimit, usedToday } = input.capacity;
  if (dailyLimit !== null && usedToday >= dailyLimit) {
    reasons.push(deviceWide('device_cap_reached'));
  }
  for (const sim of input.capacity.sims) {
    if (sim.enabled && sim.dailyLimit !== null && sim.usedToday >= sim.dailyLimit) {
      reasons.push({ code: 'sim_cap_reached', simSlot: sim.slot });
    }
  }
  return reasons;
}

function healthReasons(input: StatusInput, policy: StatusPolicy, now: Date): DeviceStatusReason[] {
  const reasons: DeviceStatusReason[] = [];
  if (input.lastSeenAt && now.getTime() - input.lastSeenAt.getTime() > policy.staleAfterSeconds * 1000) {
    reasons.push(deviceWide('stale_heartbeat'));
  }
  if (!input.healthReported) {
    return reasons;
  }
  if (input.batteryLevel !== null && input.batteryLevel < policy.lowBatteryPercent && input.charging !== true) {
    reasons.push(deviceWide('low_battery'));
  }
  if (input.networkType === 'none') {
    reasons.push(deviceWide('no_network'));
  }
  for (const sim of input.sims) {
    if (sim.enabled && sim.signalLevel === 0) {
      reasons.push({ code: 'sim_no_signal', simSlot: sim.slot });
    }
  }
  return reasons;
}

export function deriveDeviceStatus(input: StatusInput, policy: StatusPolicy, now: Date): DerivedStatus {
  if (input.presence === 'offline') {
    return { status: 'offline', reasons: settingReasons(input) };
  }
  const reasons = [...healthReasons(input, policy, now), ...settingReasons(input)].sort(
    (left, right) =>
      DEVICE_STATUS_REASON_CODES.indexOf(left.code) - DEVICE_STATUS_REASON_CODES.indexOf(right.code) ||
      (left.simSlot ?? -1) - (right.simSlot ?? -1),
  );
  return { status: reasons.length > 0 ? 'degraded' : 'online', reasons };
}
