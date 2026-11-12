import type { Device, MessageDetail, PullResponse } from '@homing/contracts';
import request from 'supertest';
import { compareIds } from '@/messages/domain/router';
import { API, bodyOf, createApiKey, heartbeat, messageOf, pairDevice, sendSms, signUp } from './api';
import { createTestApp, type TestContext } from './app';

describe('routing, leasing and maintenance', () => {
  let ctx: TestContext;
  let cookie: string;
  let apiKey: string;
  let phoneA: { id: string; token: string };
  let phoneB: { id: string; token: string };

  const pull = async (token: string, limit?: number) =>
    bodyOf<PullResponse>(
      await request(ctx.http)
        .post(`${API}/device/messages/pull`)
        .set('Authorization', `Bearer ${token}`)
        .send(limit ? { limit } : {})
        .expect(200),
    ).messages;
  const getMessage = async (id: string) =>
    bodyOf<MessageDetail>(await request(ctx.http).get(`${API}/messages/${id}`).set('Authorization', `Bearer ${apiKey}`).expect(200));
  const later = (seconds: number) => new Date(Date.now() + seconds * 1000);

  beforeAll(async () => {
    ctx = await createTestApp();
    cookie = (await signUp(ctx.http)).cookie;
    apiKey = await createApiKey(ctx.http, cookie, ['admin']);
    const a = await pairDevice(ctx.http, cookie, 'A');
    const b = await pairDevice(ctx.http, cookie, 'B');
    const ordered = [a, b].sort((left, right) => compareIds(left.id, right.id));
    phoneA = ordered[0]!;
    phoneB = ordered[1]!;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('spreads messages round robin across online devices', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      ids.push(messageOf(await sendSms(ctx.http, apiKey).expect(202)).deviceId!);
    }
    expect(ids).toEqual([phoneA.id, phoneB.id, phoneA.id, phoneB.id]);
    expect((await pull(phoneA.token)).length).toBe(2);
    expect((await pull(phoneB.token)).length).toBe(2);
  });

  it('routes to the least used device when configured', async () => {
    await request(ctx.http).patch(`${API}/account`).set('Cookie', cookie).send({ routingStrategy: 'least_used' }).expect(200);
    await sendSms(ctx.http, apiKey, { deviceId: phoneA.id }).expect(202);
    await pull(phoneA.token);
    const next = messageOf(await sendSms(ctx.http, apiKey).expect(202));
    expect(next.deviceId).toBe(phoneB.id);
    await pull(phoneB.token);
  });

  it('honours an explicit device and SIM', async () => {
    const pinned = messageOf(await sendSms(ctx.http, apiKey, { deviceId: phoneB.id, simSlot: 1 }).expect(202));
    expect(await pull(phoneA.token)).toEqual([]);
    const leased = await pull(phoneB.token);
    expect(leased.map((message) => [message.id, message.simSlot])).toEqual([[pinned.id, 1]]);
  });

  it('never leases the same message to two devices pulling at once', async () => {
    await ctx.maintenance.sweep(later(600));
    const devices = bodyOf<{ data: Device[] }>(await request(ctx.http).get(`${API}/devices`).set('Cookie', cookie).expect(200));
    expect(devices.data.map((device) => device.status)).toEqual(['offline', 'offline']);
    const created: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const message = messageOf(await sendSms(ctx.http, apiKey).expect(202));
      expect(message.deviceId).toBeNull();
      created.push(message.id);
    }
    await heartbeat(ctx.http, phoneA.token);
    await heartbeat(ctx.http, phoneB.token);
    const [fromA, fromB] = await Promise.all([pull(phoneA.token, 50), pull(phoneB.token, 50)]);
    const leased = [...fromA, ...fromB].map((message) => message.id);
    expect(new Set(leased).size).toBe(leased.length);
    expect(leased).toEqual(expect.arrayContaining(created));
    expect(fromA.length).toBeGreaterThan(0);
    expect(fromB.length).toBeGreaterThan(0);
  });

  it('puts OTP messages ahead of normal traffic', async () => {
    const normal = messageOf(await sendSms(ctx.http, apiKey, { deviceId: phoneA.id }).expect(202));
    const otp = messageOf(await sendSms(ctx.http, apiKey, { deviceId: phoneA.id, priority: 'otp', text: 'Code 123456' }).expect(202));
    expect((await pull(phoneA.token, 1)).map((message) => message.id)).toEqual([otp.id]);
    expect((await pull(phoneA.token, 1)).map((message) => message.id)).toEqual([normal.id]);
  });

  it('enforces per-SIM and per-device daily caps', async () => {
    const phone = await pairDevice(ctx.http, cookie, 'Capped');
    await heartbeat(ctx.http, phone.token);
    const updated = await request(ctx.http)
      .patch(`${API}/devices/${phone.id}`)
      .set('Cookie', cookie)
      .send({ dailyLimit: 3, sims: [{ slot: 0, dailyLimit: 1 }, { slot: 1, dailyLimit: 5 }] })
      .expect(200);
    expect(bodyOf<Device>(updated).sims.map((sim) => sim.dailyLimit)).toEqual([1, 5]);
    await request(ctx.http)
      .patch(`${API}/devices/${phone.id}`)
      .set('Cookie', cookie)
      .send({ sims: [{ slot: 6, dailyLimit: 1 }] })
      .expect(400);
    for (let index = 0; index < 5; index += 1) {
      await sendSms(ctx.http, apiKey, { deviceId: phone.id }).expect(202);
    }
    const leased = await pull(phone.token, 50);
    expect(leased.map((message) => message.simSlot).sort()).toEqual([0, 1, 1]);
    expect(await pull(phone.token, 50)).toEqual([]);
    const settings = await request(ctx.http).get(`${API}/device/settings`).set('Authorization', `Bearer ${phone.token}`).expect(200);
    expect(bodyOf<{ dailyLimit: number; version: number }>(settings)).toMatchObject({ dailyLimit: 3, version: 2 });
    const device = bodyOf<Device>(await request(ctx.http).get(`${API}/devices/${phone.id}`).set('Cookie', cookie).expect(200));
    expect(device.sentToday).toBe(3);
  });

  it('returns expired leases to the queue and fails them after the last attempt', async () => {
    const message = messageOf(await sendSms(ctx.http, apiKey, { deviceId: phoneA.id }).expect(202));
    expect((await pull(phoneA.token, 50)).map((item) => item.id)).toContain(message.id);
    await heartbeat(ctx.http, phoneA.token);
    await ctx.maintenance.sweep(later(61));
    expect(await getMessage(message.id)).toMatchObject({ state: 'pending', attempts: 1 });
    const retry = await pull(phoneA.token, 50);
    expect(retry.find((item) => item.id === message.id)?.attempt).toBe(2);
    await heartbeat(ctx.http, phoneA.token);
    await ctx.maintenance.sweep(later(61));
    const failed = await getMessage(message.id);
    expect(failed).toMatchObject({ state: 'failed', error: { code: 'lease_expired' } });
    expect(failed.events.map((event) => event.state)).toEqual(['pending', 'leased', 'pending', 'leased', 'failed']);
  });

  it('accepts a late report from the device whose lease expired', async () => {
    const message = messageOf(await sendSms(ctx.http, apiKey).expect(202));
    const holder = message.deviceId === phoneA.id ? phoneA : phoneB;
    expect((await pull(holder.token, 50)).map((item) => item.id)).toContain(message.id);
    await heartbeat(ctx.http, phoneA.token);
    await heartbeat(ctx.http, phoneB.token);
    await ctx.maintenance.sweep(later(61));
    const result = await request(ctx.http)
      .post(`${API}/device/messages/states`)
      .set('Authorization', `Bearer ${holder.token}`)
      .send({ reports: [{ messageId: message.id, state: 'sent', at: new Date().toISOString() }] })
      .expect(200);
    expect(bodyOf<{ results: { status: string }[] }>(result).results[0]?.status).toBe('accepted');
    expect((await getMessage(message.id)).state).toBe('sent');
  });

  it('promotes scheduled messages and expires stale ones', async () => {
    await request(ctx.http).patch(`${API}/devices/${phoneB.id}`).set('Cookie', cookie).send({ paused: true }).expect(200);
    const scheduled = messageOf(await sendSms(ctx.http, apiKey, { scheduleAt: later(3600).toISOString() }).expect(202));
    const stale = messageOf(
      await sendSms(ctx.http, apiKey, { deviceId: phoneB.id, validUntil: later(60).toISOString() }).expect(202),
    );
    expect(await pull(phoneB.token)).toEqual([]);
    await heartbeat(ctx.http, phoneA.token);
    await ctx.maintenance.sweep(later(120));
    expect((await getMessage(stale.id)).state).toBe('expired');
    await heartbeat(ctx.http, phoneA.token);
    await ctx.maintenance.sweep(later(3601));
    const promoted = await getMessage(scheduled.id);
    expect(promoted.state).toBe('pending');
    expect(promoted.events.map((event) => event.state)).toEqual(['scheduled', 'pending']);
  });
});
