import { type DeviceCapacity, pickDevice, pickSim, withUse } from './router';

function device(id: string, overrides: Partial<DeviceCapacity> = {}): DeviceCapacity {
  return {
    id,
    online: true,
    paused: false,
    dailyLimit: null,
    usedToday: 0,
    load: 0,
    sims: [{ slot: 0, enabled: true, dailyLimit: null, usedToday: 0 }],
    ...overrides,
  };
}

describe('pickDevice', () => {
  it('rotates round robin by device id and wraps around', () => {
    const fleet = [device('dev_b'), device('dev_a'), device('dev_c')];
    expect(pickDevice(fleet, 'round_robin', null)?.id).toBe('dev_a');
    expect(pickDevice(fleet, 'round_robin', 'dev_a')?.id).toBe('dev_b');
    expect(pickDevice(fleet, 'round_robin', 'dev_c')?.id).toBe('dev_a');
    expect(pickDevice(fleet, 'round_robin', 'dev_removed')?.id).toBe('dev_a');
  });

  it('picks the device with the lowest load for least used', () => {
    const fleet = [device('dev_a', { load: 9 }), device('dev_b', { load: 2 }), device('dev_c', { load: 5 })];
    expect(pickDevice(fleet, 'least_used', null)?.id).toBe('dev_b');
  });

  it('skips offline, paused and capped devices', () => {
    const fleet = [
      device('dev_a', { online: false }),
      device('dev_b', { paused: true }),
      device('dev_c', { dailyLimit: 5, usedToday: 5 }),
      device('dev_d', { sims: [{ slot: 0, enabled: true, dailyLimit: 1, usedToday: 1 }] }),
      device('dev_e'),
    ];
    expect(pickDevice(fleet, 'round_robin', null)?.id).toBe('dev_e');
  });

  it('orders ids by code point so mixed case ids rotate', () => {
    const fleet = [device('dev_b'), device('dev_N')];
    expect(pickDevice(fleet, 'round_robin', 'dev_N')?.id).toBe('dev_b');
    expect(pickDevice(fleet, 'round_robin', 'dev_b')?.id).toBe('dev_N');
  });

  it('returns null when nothing is eligible', () => {
    expect(pickDevice([device('dev_a', { online: false })], 'least_used', null)).toBeNull();
  });
});

describe('pickSim', () => {
  const dualSim = device('dev_a', {
    sims: [
      { slot: 0, enabled: true, dailyLimit: 10, usedToday: 4 },
      { slot: 1, enabled: true, dailyLimit: 10, usedToday: 1 },
    ],
  });

  it('picks the least used SIM with capacity', () => {
    expect(pickSim(dualSim, null)).toEqual({ ok: true, slot: 1 });
  });

  it('honours an explicit SIM and its cap', () => {
    expect(pickSim(dualSim, 0)).toEqual({ ok: true, slot: 0 });
    const capped = withUse(device('dev_b', { sims: [{ slot: 0, enabled: true, dailyLimit: 1, usedToday: 0 }] }), 0);
    expect(pickSim(capped, 0)).toEqual({ ok: false, reason: 'sim_limit_reached' });
  });

  it('rejects disabled or unknown SIMs', () => {
    const disabled = device('dev_c', { sims: [{ slot: 0, enabled: false, dailyLimit: null, usedToday: 0 }] });
    expect(pickSim(disabled, 0)).toEqual({ ok: false, reason: 'sim_unavailable' });
    expect(pickSim(dualSim, 3)).toEqual({ ok: false, reason: 'sim_unavailable' });
  });

  it('stops at the device daily limit', () => {
    expect(pickSim(device('dev_d', { dailyLimit: 3, usedToday: 3 }), null)).toEqual({
      ok: false,
      reason: 'device_limit_reached',
    });
  });

  it('lets the phone choose when it reported no SIMs', () => {
    expect(pickSim(device('dev_e', { sims: [] }), null)).toEqual({ ok: true, slot: null });
  });
});
