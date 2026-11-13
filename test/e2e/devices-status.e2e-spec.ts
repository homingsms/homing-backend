import type { Device, MessageDetail, MessagePage } from '@homing/contracts';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { devices } from '@/database/schema';
import { API, bodyOf, createApiKey, heartbeat, pairDevice, sendSms, signUp } from './api';
import { createTestApp, type TestContext } from './app';
import { assertMatchesSchema } from './contract';

describe('device status and SIM filters', () => {
  let ctx: TestContext;
  let cookie: string;
  let apiKey: string;
  let device: { id: string; token: string };

  const getDevice = async () => {
    const body = bodyOf<Device>(await request(ctx.http).get(`${API}/devices/${device.id}`).set('Cookie', cookie).expect(200));
    assertMatchesSchema('public', 'Device', body);
    return body;
  };

  const beat = (body: Record<string, unknown>) =>
    request(ctx.http)
      .post(`${API}/device/heartbeat`)
      .set('Authorization', `Bearer ${device.token}`)
      .send({
        appVersion: '1.0.1',
        battery: { level: 80, charging: true },
        network: { type: 'wifi' },
        sims: [
          { slot: 0, signalLevel: 3, sentToday: 0 },
          { slot: 1, signalLevel: 3, sentToday: 0 },
        ],
        ...body,
      })
      .expect(200);

  beforeAll(async () => {
    ctx = await createTestApp();
    const owner = await signUp(ctx.http);
    cookie = owner.cookie;
    apiKey = await createApiKey(ctx.http, cookie, ['admin']);
    const paired = await pairDevice(ctx.http, cookie, 'Status phone');
    device = { id: paired.id, token: paired.token };
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('is online with no reasons when healthy', async () => {
    await heartbeat(ctx.http, device.token);
    expect(await getDevice()).toMatchObject({ status: 'online', statusReasons: [] });
  });

  it('reports degraded with typed reasons from the heartbeat', async () => {
    await beat({
      battery: { level: 9, charging: false },
      network: { type: 'none' },
      sims: [
        { slot: 0, signalLevel: 3, sentToday: 0 },
        { slot: 1, signalLevel: 0, sentToday: 0 },
      ],
    });
    const result = await getDevice();
    expect(result.status).toBe('degraded');
    expect(result.statusReasons).toEqual([
      { code: 'low_battery', simSlot: null },
      { code: 'no_network', simSlot: null },
      { code: 'sim_no_signal', simSlot: 1 },
    ]);
    const list = bodyOf<{ data: Device[] }>(await request(ctx.http).get(`${API}/devices`).set('Cookie', cookie).expect(200));
    expect(list.data[0]?.status).toBe('degraded');
  });

  it('reports settings and caps, then stale heartbeats, then offline', async () => {
    await beat({});
    await request(ctx.http)
      .patch(`${API}/devices/${device.id}`)
      .set('Cookie', cookie)
      .send({ paused: true, sims: [{ slot: 0, enabled: false }, { slot: 1, enabled: false }] })
      .expect(200);
    expect((await getDevice()).statusReasons).toEqual([
      { code: 'paused', simSlot: null },
      { code: 'all_sims_disabled', simSlot: null },
    ]);
    await request(ctx.http)
      .patch(`${API}/devices/${device.id}`)
      .set('Cookie', cookie)
      .send({ paused: false, dailyLimit: 1, sims: [{ slot: 0, enabled: true, dailyLimit: 1 }, { slot: 1, enabled: true }] })
      .expect(200);
    await sendSms(ctx.http, apiKey, { deviceId: device.id, simSlot: 0 }).expect(202);
    await request(ctx.http).post(`${API}/device/messages/pull`).set('Authorization', `Bearer ${device.token}`).send({}).expect(200);
    expect((await getDevice()).statusReasons).toEqual([
      { code: 'device_cap_reached', simSlot: null },
      { code: 'sim_cap_reached', simSlot: 0 },
    ]);

    await request(ctx.http).patch(`${API}/devices/${device.id}`).set('Cookie', cookie).send({ dailyLimit: null, sims: [{ slot: 0, dailyLimit: null }] }).expect(200);
    await ctx.database.db.update(devices).set({ lastSeenAt: new Date(Date.now() - 150_000) }).where(eq(devices.id, device.id));
    expect(await getDevice()).toMatchObject({ status: 'degraded', statusReasons: [{ code: 'stale_heartbeat', simSlot: null }] });

    await ctx.maintenance.sweep(new Date(Date.now() + 60_000));
    expect(await getDevice()).toMatchObject({ status: 'offline', statusReasons: [] });
    await beat({});
    expect(await getDevice()).toMatchObject({ status: 'online', statusReasons: [] });
  });

  it('filters messages by SIM slot', async () => {
    const first = bodyOf<MessageDetail>(await sendSms(ctx.http, apiKey, { deviceId: device.id, simSlot: 0 }).expect(202));
    const second = bodyOf<MessageDetail>(await sendSms(ctx.http, apiKey, { deviceId: device.id, simSlot: 1 }).expect(202));
    await request(ctx.http).post(`${API}/device/messages/pull`).set('Authorization', `Bearer ${device.token}`).send({}).expect(200);
    const page = bodyOf<MessagePage>(
      await request(ctx.http)
        .get(`${API}/messages`)
        .query({ deviceId: device.id, simSlot: 1 })
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200),
    );
    assertMatchesSchema('public', 'MessagePage', page);
    expect(page.data.map((message) => message.id)).toEqual([second.id]);
    const slotZero = bodyOf<MessagePage>(
      await request(ctx.http).get(`${API}/messages`).query({ simSlot: 0 }).set('Authorization', `Bearer ${apiKey}`).expect(200),
    );
    expect(slotZero.data.map((message) => message.id)).toContain(first.id);
    expect(slotZero.data.every((message) => message.simSlot === 0)).toBe(true);
    await request(ctx.http).get(`${API}/messages`).query({ simSlot: 9 }).set('Authorization', `Bearer ${apiKey}`).expect(400);
  });
});
