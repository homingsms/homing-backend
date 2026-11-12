import type { DeviceCapacity } from '@/messages/domain/router';
import { selectForLease } from './lease-selection';

const device: DeviceCapacity = {
  id: 'dev_a',
  online: true,
  paused: false,
  dailyLimit: 5,
  usedToday: 2,
  load: 2,
  sims: [
    { slot: 0, enabled: true, dailyLimit: 2, usedToday: 1 },
    { slot: 1, enabled: true, dailyLimit: null, usedToday: 0 },
  ],
};

const candidate = (id: string, requestedSimSlot: number | null = null) => ({ id, requestedSimSlot });

describe('selectForLease', () => {
  it('respects the requested limit', () => {
    expect(selectForLease({ ...device, dailyLimit: null }, [candidate('a'), candidate('b'), candidate('c')], 2)).toHaveLength(2);
  });

  it('spreads messages across SIMs by usage', () => {
    const chosen = selectForLease(device, [candidate('a'), candidate('b'), candidate('c')], 10);
    expect(chosen.map((choice) => choice.slot)).toEqual([1, 0, 1]);
  });

  it('stops at the device daily limit', () => {
    const chosen = selectForLease(device, [candidate('a'), candidate('b'), candidate('c'), candidate('d')], 10);
    expect(chosen.map((choice) => choice.candidate.id)).toEqual(['a', 'b', 'c']);
  });

  it('skips messages pinned to a full SIM but keeps leasing others', () => {
    const full = { ...device, dailyLimit: null, sims: [{ slot: 0, enabled: true, dailyLimit: 1, usedToday: 1 }, device.sims[1]!] };
    const chosen = selectForLease(full, [candidate('pinned', 0), candidate('free')], 10);
    expect(chosen.map((choice) => [choice.candidate.id, choice.slot])).toEqual([['free', 1]]);
  });
});
