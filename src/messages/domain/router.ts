export type RoutingStrategy = 'round_robin' | 'least_used';

export interface SimCapacity {
  slot: number;
  enabled: boolean;
  dailyLimit: number | null;
  usedToday: number;
}

export interface DeviceCapacity {
  id: string;
  online: boolean;
  paused: boolean;
  dailyLimit: number | null;
  usedToday: number;
  load: number;
  sims: SimCapacity[];
}

export type SimChoice =
  | { ok: true; slot: number | null }
  | { ok: false; reason: 'device_limit_reached' | 'sim_unavailable' | 'sim_limit_reached' };

export function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function simHasCapacity(sim: SimCapacity): boolean {
  return sim.enabled && (sim.dailyLimit === null || sim.usedToday < sim.dailyLimit);
}

export function deviceHasCapacity(device: DeviceCapacity): boolean {
  const underDeviceLimit = device.dailyLimit === null || device.usedToday < device.dailyLimit;
  return underDeviceLimit && (device.sims.length === 0 || device.sims.some(simHasCapacity));
}

export function isRoutable(device: DeviceCapacity): boolean {
  return device.online && !device.paused && deviceHasCapacity(device);
}

export function pickDevice(
  devices: DeviceCapacity[],
  strategy: RoutingStrategy,
  lastRoutedDeviceId: string | null,
): DeviceCapacity | null {
  const eligible = devices.filter(isRoutable).sort((a, b) => compareIds(a.id, b.id));
  if (eligible.length === 0) {
    return null;
  }
  if (strategy === 'least_used') {
    return eligible.reduce((best, device) => (device.load < best.load ? device : best));
  }
  const nextIndex = lastRoutedDeviceId ? eligible.findIndex((device) => device.id > lastRoutedDeviceId) : 0;
  return eligible[nextIndex === -1 ? 0 : nextIndex] ?? null;
}

export function pickSim(device: DeviceCapacity, requestedSlot: number | null): SimChoice {
  if (device.dailyLimit !== null && device.usedToday >= device.dailyLimit) {
    return { ok: false, reason: 'device_limit_reached' };
  }
  if (device.sims.length === 0) {
    return { ok: true, slot: requestedSlot };
  }
  if (requestedSlot !== null) {
    const sim = device.sims.find((candidate) => candidate.slot === requestedSlot);
    if (!sim?.enabled) {
      return { ok: false, reason: 'sim_unavailable' };
    }
    return simHasCapacity(sim) ? { ok: true, slot: sim.slot } : { ok: false, reason: 'sim_limit_reached' };
  }
  const best = device.sims
    .filter(simHasCapacity)
    .reduce<SimCapacity | null>(
      (current, sim) =>
        !current || sim.usedToday < current.usedToday || (sim.usedToday === current.usedToday && sim.slot < current.slot)
          ? sim
          : current,
      null,
    );
  return best ? { ok: true, slot: best.slot } : { ok: false, reason: 'sim_limit_reached' };
}

export function withUse(device: DeviceCapacity, slot: number | null): DeviceCapacity {
  return {
    ...device,
    usedToday: device.usedToday + 1,
    load: device.load + 1,
    sims: device.sims.map((sim) => (sim.slot === slot ? { ...sim, usedToday: sim.usedToday + 1 } : sim)),
  };
}
