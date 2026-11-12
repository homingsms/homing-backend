import { type DeviceCapacity, pickSim, withUse } from '@/messages/domain/router';

export interface LeaseCandidate {
  id: string;
  requestedSimSlot: number | null;
}

export interface LeaseChoice<T extends LeaseCandidate> {
  candidate: T;
  slot: number | null;
}

export function selectForLease<T extends LeaseCandidate>(
  device: DeviceCapacity,
  candidates: T[],
  limit: number,
): LeaseChoice<T>[] {
  let current = device;
  const chosen: LeaseChoice<T>[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= limit) {
      break;
    }
    const choice = pickSim(current, candidate.requestedSimSlot);
    if (!choice.ok) {
      if (choice.reason === 'device_limit_reached') {
        break;
      }
      continue;
    }
    chosen.push({ candidate, slot: choice.slot });
    current = withUse(current, choice.slot);
  }
  return chosen;
}
