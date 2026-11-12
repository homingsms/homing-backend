import type { AppConfig } from '@/config/app-config.service';
import type { DeviceRow, DeviceSimRow } from './entities/device.entity';

export interface DeviceSettingsResponse {
  version: number;
  paused: boolean;
  heartbeatIntervalSeconds: number;
  pullIntervalSeconds: number;
  leaseSeconds: number;
  dailyLimit: number | null;
  sims: { slot: number; enabled: boolean; dailyLimit: number | null }[];
  optOutKeywords: string[];
}

export function buildDeviceSettings(device: DeviceRow, sims: DeviceSimRow[], config: AppConfig): DeviceSettingsResponse {
  return {
    version: device.settingsVersion,
    paused: device.paused,
    heartbeatIntervalSeconds: config.get('HEARTBEAT_INTERVAL_SECONDS'),
    pullIntervalSeconds: config.get('PULL_INTERVAL_SECONDS'),
    leaseSeconds: config.get('LEASE_SECONDS'),
    dailyLimit: device.dailyLimit,
    sims: sims.map((sim) => ({ slot: sim.slot, enabled: sim.enabled, dailyLimit: sim.dailyLimit })),
    optOutKeywords: config.get('OPT_OUT_KEYWORDS').map((keyword) => keyword.toUpperCase()),
  };
}
