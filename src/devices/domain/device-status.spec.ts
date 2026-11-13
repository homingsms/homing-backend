import { deriveDeviceStatus, type StatusInput } from './device-status';

const now = new Date('2026-11-12T12:00:00Z');
const policy = { lowBatteryPercent: 15, staleAfterSeconds: 120 };

function input(overrides: Partial<StatusInput> = {}): StatusInput {
  return {
    presence: 'online',
    paused: false,
    lastSeenAt: new Date(now.getTime() - 30_000),
    batteryLevel: 80,
    charging: false,
    networkType: 'wifi',
    healthReported: true,
    sims: [
      { slot: 0, enabled: true, signalLevel: 3 },
      { slot: 1, enabled: true, signalLevel: 2 },
    ],
    capacity: {
      dailyLimit: null,
      usedToday: 0,
      sims: [
        { slot: 0, enabled: true, dailyLimit: null, usedToday: 0 },
        { slot: 1, enabled: true, dailyLimit: null, usedToday: 0 },
      ],
    },
    ...overrides,
  };
}

describe('deriveDeviceStatus', () => {
  it('is online with no reasons when nothing limits the device', () => {
    expect(deriveDeviceStatus(input(), policy, now)).toEqual({ status: 'online', reasons: [] });
  });

  it('is offline when presence is offline and keeps only settings reasons', () => {
    const result = deriveDeviceStatus(
      input({ presence: 'offline', paused: true, batteryLevel: 3, networkType: 'none', lastSeenAt: new Date(0) }),
      policy,
      now,
    );
    expect(result).toEqual({ status: 'offline', reasons: [{ code: 'paused', simSlot: null }] });
  });

  it('lists every problem in a stable order', () => {
    const result = deriveDeviceStatus(
      input({
        paused: true,
        batteryLevel: 9,
        networkType: 'none',
        lastSeenAt: new Date(now.getTime() - 121_000),
        sims: [
          { slot: 0, enabled: true, signalLevel: 0 },
          { slot: 1, enabled: true, signalLevel: 4 },
        ],
        capacity: {
          dailyLimit: 10,
          usedToday: 10,
          sims: [
            { slot: 0, enabled: true, dailyLimit: 5, usedToday: 5 },
            { slot: 1, enabled: true, dailyLimit: 50, usedToday: 5 },
          ],
        },
      }),
      policy,
      now,
    );
    expect(result.status).toBe('degraded');
    expect(result.reasons).toEqual([
      { code: 'paused', simSlot: null },
      { code: 'low_battery', simSlot: null },
      { code: 'no_network', simSlot: null },
      { code: 'sim_no_signal', simSlot: 0 },
      { code: 'device_cap_reached', simSlot: null },
      { code: 'sim_cap_reached', simSlot: 0 },
      { code: 'stale_heartbeat', simSlot: null },
    ]);
  });

  it('does not flag low battery while charging or at the threshold', () => {
    expect(deriveDeviceStatus(input({ batteryLevel: 5, charging: true }), policy, now).status).toBe('online');
    expect(deriveDeviceStatus(input({ batteryLevel: 15 }), policy, now).status).toBe('online');
    expect(deriveDeviceStatus(input({ batteryLevel: 14 }), policy, now).reasons).toEqual([{ code: 'low_battery', simSlot: null }]);
  });

  it('flags all SIMs disabled and ignores signal and caps on disabled SIMs', () => {
    const result = deriveDeviceStatus(
      input({
        sims: [
          { slot: 0, enabled: false, signalLevel: 0 },
          { slot: 1, enabled: false, signalLevel: 0 },
        ],
        capacity: {
          dailyLimit: null,
          usedToday: 0,
          sims: [
            { slot: 0, enabled: false, dailyLimit: 1, usedToday: 1 },
            { slot: 1, enabled: false, dailyLimit: null, usedToday: 0 },
          ],
        },
      }),
      policy,
      now,
    );
    expect(result.reasons).toEqual([{ code: 'all_sims_disabled', simSlot: null }]);
  });

  it('ignores health fields the phone has not reported yet', () => {
    const result = deriveDeviceStatus(input({ healthReported: false, batteryLevel: null, networkType: null }), policy, now);
    expect(result).toEqual({ status: 'online', reasons: [] });
  });
});
