import type { MessageDetail, StateReportResponse, WebhookDeliveryPage } from '@homing/contracts';
import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import { newId } from '@/common/ids';
import { messages, webhookDeliveries, webhookEvents, webhookOutbox } from '@/database/schema';
import { WebhookOutbox } from '@/webhooks/webhook-outbox.service';
import { API, bodyOf, createApiKey, heartbeat, pairDevice, sendSms, signUp } from './api';
import { createTestApp, type TestContext } from './app';
import { assertMatchesSchema } from './contract';
import { waitFor, WebhookReceiver } from './webhook-receiver';

describe('webhook outbox', () => {
  let ctx: TestContext;
  const receiver = new WebhookReceiver();
  let cookie: string;
  let apiKey: string;
  let device: { id: string; token: string };
  let webhookId: string;

  const outboxCount = async () => (await ctx.database.db.select({ total: count() }).from(webhookOutbox))[0]?.total ?? 0;
  const pull = () =>
    request(ctx.http).post(`${API}/device/messages/pull`).set('Authorization', `Bearer ${device.token}`).send({ limit: 10 }).expect(200);

  beforeAll(async () => {
    ctx = await createTestApp({ config: { WEBHOOK_OUTBOX_INTERVAL_MS: 0 } });
    const url = await receiver.start();
    const owner = await signUp(ctx.http);
    cookie = owner.cookie;
    apiKey = await createApiKey(ctx.http, cookie, ['admin']);
    const created = await request(ctx.http)
      .post(`${API}/webhooks`)
      .set('Cookie', cookie)
      .send({ url, events: ['message.sent', 'message.failed', 'message.cancelled', 'message.expired'] })
      .expect(201);
    webhookId = bodyOf<{ id: string }>(created).id;
    const paired = await pairDevice(ctx.http, cookie);
    device = { id: paired.id, token: paired.token };
    await heartbeat(ctx.http, device.token);
  });

  afterAll(async () => {
    await ctx.close();
    await receiver.stop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rolls the state change back with the event when the outbox write fails', async () => {
    const message = bodyOf<MessageDetail>(await sendSms(ctx.http, apiKey, { deviceId: device.id }).expect(202));
    await pull();
    await ctx.outbox.dispatchPending();
    const before = await outboxCount();
    jest.spyOn(ctx.app.get(WebhookOutbox), 'add').mockRejectedValueOnce(new Error('outbox unavailable'));
    await request(ctx.http)
      .post(`${API}/device/messages/states`)
      .set('Authorization', `Bearer ${device.token}`)
      .send({ reports: [{ messageId: message.id, state: 'sent', at: new Date().toISOString() }] })
      .expect(500);
    const [row] = await ctx.database.db.select({ state: messages.state }).from(messages).where(eq(messages.id, message.id));
    expect(row?.state).toBe('leased');
    expect(await outboxCount()).toBe(before);

    const retried = await request(ctx.http)
      .post(`${API}/device/messages/states`)
      .set('Authorization', `Bearer ${device.token}`)
      .send({ reports: [{ messageId: message.id, state: 'sent', at: new Date().toISOString() }] })
      .expect(200);
    expect(bodyOf<StateReportResponse>(retried).results[0]?.status).toBe('accepted');
    expect(await outboxCount()).toBe(before + 1);
    const dispatched = await ctx.outbox.dispatchPending();
    expect(dispatched).toEqual({ events: before + 1, deliveries: 1 });
    expect(await outboxCount()).toBe(0);
    const delivered = await waitFor(() => receiver.ofType('message.sent').find((item) => item.body.includes(message.id)));
    expect(JSON.parse(delivered.body)).toMatchObject({ type: 'message.sent', data: { message: { id: message.id, state: 'sent' } } });
  });

  it('writes nothing when the surrounding transaction rolls back', async () => {
    const before = await outboxCount();
    const outbox = ctx.app.get(WebhookOutbox);
    const accountId = (await request(ctx.http).get(`${API}/account`).set('Cookie', cookie).expect(200)).body as { id: string };
    await expect(
      ctx.database.db.transaction(async (tx) => {
        await outbox.add(tx, [{ accountId: accountId.id, type: 'message.sent', data: { probe: true } }]);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await outboxCount()).toBe(before);
  });

  it('emits message.cancelled when a message is cancelled', async () => {
    const message = bodyOf<MessageDetail>(
      await sendSms(ctx.http, apiKey, { scheduleAt: new Date(Date.now() + 3_600_000).toISOString() }).expect(202),
    );
    await request(ctx.http).post(`${API}/messages/${message.id}/cancel`).set('Authorization', `Bearer ${apiKey}`).expect(200);
    await ctx.outbox.dispatchPending();
    const event = await waitFor(() => receiver.ofType('message.cancelled').find((item) => item.body.includes(message.id)));
    const parsed: unknown = JSON.parse(event.body);
    assertMatchesSchema('public', 'MessageWebhookEvent', parsed);
    expect(parsed).toMatchObject({ data: { message: { id: message.id, state: 'cancelled' } } });
  });

  it('emits message.expired when a pending message passes validUntil', async () => {
    await request(ctx.http).patch(`${API}/devices/${device.id}`).set('Cookie', cookie).send({ paused: true }).expect(200);
    const message = bodyOf<MessageDetail>(
      await sendSms(ctx.http, apiKey, { validUntil: new Date(Date.now() + 60_000).toISOString() }).expect(202),
    );
    await ctx.maintenance.sweep(new Date(Date.now() + 120_000));
    await ctx.outbox.dispatchPending();
    const event = await waitFor(() => receiver.ofType('message.expired').find((item) => item.body.includes(message.id)));
    const parsed: unknown = JSON.parse(event.body);
    assertMatchesSchema('public', 'MessageWebhookEvent', parsed);
    expect(parsed).toMatchObject({ data: { message: { id: message.id, state: 'expired' } } });
    await request(ctx.http).patch(`${API}/devices/${device.id}`).set('Cookie', cookie).send({ paused: false }).expect(200);
  });

  it('skips events nobody subscribed to and requeues deliveries that never reached the queue', async () => {
    const accountId = ((await request(ctx.http).get(`${API}/account`).set('Cookie', cookie)).body as { id: string }).id;
    await ctx.database.db.insert(webhookOutbox).values({ id: newId('evt'), accountId, type: 'device.online', data: {} });
    expect(await ctx.outbox.dispatchPending()).toEqual({ events: 1, deliveries: 0 });

    const old = new Date(Date.now() - 5 * 60_000);
    const eventId = newId('evt');
    const deliveryId = newId('whd');
    await ctx.database.db.insert(webhookEvents).values({
      id: eventId,
      accountId,
      type: 'message.failed',
      payload: { id: eventId, type: 'message.failed', createdAt: old.toISOString(), accountId, data: { message: { id: 'msg_lost' } } },
      createdAt: old,
    });
    await ctx.database.db.insert(webhookDeliveries).values({ id: deliveryId, endpointId: webhookId, eventId, createdAt: old, updatedAt: old });
    expect(await ctx.outbox.recoverStalled()).toBeGreaterThanOrEqual(1);
    await waitFor(() => receiver.received.find((item) => item.headers['homing-event-id'] === eventId));
    const log = bodyOf<WebhookDeliveryPage>(
      await request(ctx.http).get(`${API}/webhooks/${webhookId}/deliveries`).set('Cookie', cookie).expect(200),
    );
    await waitFor(async () => {
      const [row] = await ctx.database.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId));
      return row?.status === 'succeeded' ? row : undefined;
    });
    expect(log.data.some((item) => item.id === deliveryId)).toBe(true);
  });
});
