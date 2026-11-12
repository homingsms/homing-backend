import type {
  ApiKeyList,
  DeviceList,
  InboxPage,
  InboxPushResponse,
  MessageDetail,
  PullResponse,
  StateReportResponse,
  WebhookDeliveryPage,
  WebhookEndpointWithSecret,
} from '@homing/contracts';
import request from 'supertest';
import { verifySignatureHeader } from '@/webhooks/domain/signature';
import { API, bodyOf, createApiKey, heartbeat, messageOf, pairDevice, sendSms, signUp } from './api';
import { createTestApp, type TestContext } from './app';
import { assertMatchesSchema } from './contract';
import { waitFor, WebhookReceiver } from './webhook-receiver';

describe('messaging flow', () => {
  let ctx: TestContext;
  const receiver = new WebhookReceiver();
  let cookie: string;
  let apiKey: string;
  let webhook: WebhookEndpointWithSecret;
  let device: { id: string; token: string };
  let messageId: string;

  const asDevice = (token: string) => `Bearer ${token}`;

  beforeAll(async () => {
    ctx = await createTestApp();
    const url = await receiver.start();
    const owner = await signUp(ctx.http);
    cookie = owner.cookie;
    assertMatchesSchema('public', 'Session', owner.session);
    apiKey = await createApiKey(ctx.http, cookie, ['messages:send', 'messages:read', 'inbox:read', 'webhooks:manage', 'devices:manage']);
    const created = await request(ctx.http)
      .post(`${API}/webhooks`)
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        url,
        events: ['message.sent', 'message.delivered', 'message.failed', 'inbox.received', 'opt_out.received', 'device.online', 'device.offline'],
      })
      .expect(201);
    webhook = bodyOf<WebhookEndpointWithSecret>(created);
    assertMatchesSchema('public', 'WebhookEndpointWithSecret', webhook);
  });

  afterAll(async () => {
    await ctx.close();
    await receiver.stop();
  });

  it('keeps the session and shows API keys without secrets', async () => {
    const me = await request(ctx.http).get(`${API}/auth/me`).set('Cookie', cookie).expect(200);
    assertMatchesSchema('public', 'Session', me.body);
    const keys = bodyOf<ApiKeyList>(await request(ctx.http).get(`${API}/api-keys`).set('Cookie', cookie).expect(200));
    assertMatchesSchema('public', 'ApiKeyList', keys);
    expect(keys.data[0]?.prefix.startsWith('hk_live_')).toBe(true);
    expect(JSON.stringify(keys)).not.toContain(apiKey);
  });

  it('pairs a device with a one-time code and records its heartbeat', async () => {
    const paired = await pairDevice(ctx.http, cookie, 'Shop phone');
    device = { id: paired.id, token: paired.token };
    assertMatchesSchema('public', 'PairingCode', paired.code);
    assertMatchesSchema('device', 'PairResponse', paired.paired);
    await request(ctx.http)
      .post(`${API}/device/pair`)
      .send({ code: paired.code.code, appVersion: '1.0.0', sims: [] })
      .expect(401);

    const beat = await heartbeat(ctx.http, device.token);
    assertMatchesSchema('device', 'HeartbeatResponse', beat);
    const devices = bodyOf<DeviceList>(await request(ctx.http).get(`${API}/devices`).set('Authorization', `Bearer ${apiKey}`).expect(200));
    assertMatchesSchema('public', 'DeviceList', devices);
    expect(devices.data[0]).toMatchObject({ id: device.id, name: 'Shop phone', status: 'online' });
    expect(devices.data[0]?.sims.map((sim) => sim.slot)).toEqual([0, 1]);
    const settings = await request(ctx.http).get(`${API}/device/settings`).set('Authorization', asDevice(device.token)).expect(200);
    assertMatchesSchema('device', 'DeviceSettings', settings.body);
  });

  it('accepts a message from an API key and routes it to the online device', async () => {
    const response = await sendSms(ctx.http, apiKey, { idempotencyKey: 'order-42', metadata: { orderId: '42' } }).expect(202);
    const message = messageOf(response);
    assertMatchesSchema('public', 'MessageDetail', message);
    expect(message).toMatchObject({ state: 'pending', deviceId: device.id, idempotencyKey: 'order-42' });
    messageId = message.id;
  });

  it('replays an idempotent resend and rejects a changed body', async () => {
    const replay = await sendSms(ctx.http, apiKey, { idempotencyKey: 'order-42', metadata: { orderId: '42' } }).expect(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(messageOf(replay).id).toBe(messageId);
    const conflict = await sendSms(ctx.http, apiKey, { idempotencyKey: 'order-42', text: 'Different text' }).expect(409);
    assertMatchesSchema('public', 'Error', conflict.body);
    const list = await request(ctx.http).get(`${API}/messages`).set('Authorization', `Bearer ${apiKey}`).expect(200);
    expect(bodyOf<{ data: unknown[] }>(list).data).toHaveLength(1);
  });

  it('leases the message to the device, which reports sent and delivered', async () => {
    const pulled = bodyOf<PullResponse>(
      await request(ctx.http).post(`${API}/device/messages/pull`).set('Authorization', asDevice(device.token)).send({}).expect(200),
    );
    assertMatchesSchema('device', 'PullResponse', pulled);
    expect(pulled.messages.map((message) => message.id)).toEqual([messageId]);
    expect(pulled.messages[0]).toMatchObject({ attempt: 1, simSlot: 0, text: 'Hello from Homing' });

    const again = bodyOf<PullResponse>(
      await request(ctx.http).post(`${API}/device/messages/pull`).set('Authorization', asDevice(device.token)).send({}).expect(200),
    );
    expect(again.messages).toEqual([]);

    const at = new Date();
    const reports = ['queued', 'sending', 'sent', 'delivered'].map((state, index) => ({
      messageId,
      state,
      at: new Date(at.getTime() + index * 1000).toISOString(),
      ...(state === 'sent' ? { partsCount: 1 } : {}),
    }));
    const result = bodyOf<StateReportResponse>(
      await request(ctx.http)
        .post(`${API}/device/messages/states`)
        .set('Authorization', asDevice(device.token))
        .send({ reports })
        .expect(200),
    );
    assertMatchesSchema('device', 'StateReportResponse', result);
    expect(result.results.map((item) => item.status)).toEqual(['accepted', 'accepted', 'accepted', 'accepted']);

    const retried = bodyOf<StateReportResponse>(
      await request(ctx.http)
        .post(`${API}/device/messages/states`)
        .set('Authorization', asDevice(device.token))
        .send({ reports })
        .expect(200),
    );
    expect(retried.results.map((item) => item.status)).toEqual(['duplicate', 'duplicate', 'duplicate', 'duplicate']);

    const detail = bodyOf<MessageDetail>(
      await request(ctx.http).get(`${API}/messages/${messageId}`).set('Authorization', `Bearer ${apiKey}`).expect(200),
    );
    assertMatchesSchema('public', 'MessageDetail', detail);
    expect(detail.state).toBe('delivered');
    expect(detail.events.map((event) => event.state)).toEqual(['pending', 'leased', 'queued', 'sending', 'sent', 'delivered']);
    expect(detail.sentAt).not.toBeNull();
    expect(detail.deliveredAt).not.toBeNull();
  });

  it('signs and delivers the message webhooks', async () => {
    const delivered = await waitFor(() => receiver.ofType('message.delivered')[0]);
    const sent = await waitFor(() => receiver.ofType('message.sent')[0]);
    for (const hook of [sent, delivered]) {
      const signature = hook.headers['homing-signature'];
      expect(typeof signature).toBe('string');
      expect(verifySignatureHeader(signature as string, hook.body, webhook.secret, Math.floor(Date.now() / 1000))).toBe(true);
      expect(verifySignatureHeader(signature as string, hook.body, 'whsec_wrong', Math.floor(Date.now() / 1000))).toBe(false);
      expect(hook.headers['homing-event-type']).toBe(hook.type);
      const payload: unknown = JSON.parse(hook.body);
      assertMatchesSchema('public', 'MessageWebhookEvent', payload);
    }
    const deliveries = bodyOf<WebhookDeliveryPage>(
      await request(ctx.http).get(`${API}/webhooks/${webhook.id}/deliveries`).set('Authorization', `Bearer ${apiKey}`).expect(200),
    );
    assertMatchesSchema('public', 'WebhookDeliveryPage', deliveries);
    await waitFor(async () => {
      const page = bodyOf<WebhookDeliveryPage>(
        await request(ctx.http)
          .get(`${API}/webhooks/${webhook.id}/deliveries?status=succeeded`)
          .set('Authorization', `Bearer ${apiKey}`),
      );
      return page.data.length >= 2 ? page : undefined;
    });
  });

  it('stores inbound SMS in the inbox, dedupes retries and flags opt-outs', async () => {
    const push = (localId: string, text: string) =>
      request(ctx.http)
        .post(`${API}/device/inbox`)
        .set('Authorization', asDevice(device.token))
        .send({
          messages: [{ localId, type: 'sms', from: '+2348099999999', simSlot: 0, receivedAt: new Date().toISOString(), text }],
        })
        .expect(200);
    const first = bodyOf<InboxPushResponse>(await push('local-1', 'Is my order ready?'));
    assertMatchesSchema('device', 'InboxPushResponse', first);
    expect(first.results[0]?.duplicate).toBe(false);
    const retry = bodyOf<InboxPushResponse>(await push('local-1', 'Is my order ready?'));
    expect(retry.results[0]).toEqual({ ...first.results[0], duplicate: true });
    await push('local-2', 'STOP');

    const inbox = bodyOf<InboxPage>(await request(ctx.http).get(`${API}/inbox`).set('Authorization', `Bearer ${apiKey}`).expect(200));
    assertMatchesSchema('public', 'InboxPage', inbox);
    expect(inbox.data.map((item) => item.text).sort()).toEqual(['Is my order ready?', 'STOP']);
    const single = await request(ctx.http).get(`${API}/inbox/${first.results[0]!.id}`).set('Authorization', `Bearer ${apiKey}`).expect(200);
    assertMatchesSchema('public', 'InboxMessage', single.body);

    const received = await waitFor(() => (receiver.ofType('inbox.received').length >= 2 ? receiver.ofType('inbox.received') : undefined));
    assertMatchesSchema('public', 'InboxWebhookEvent', JSON.parse(received[0]!.body));
    const optOut = await waitFor(() => receiver.ofType('opt_out.received')[0]);
    const payload = JSON.parse(optOut.body) as { data: { keyword: string; phoneNumber: string } };
    assertMatchesSchema('public', 'OptOutWebhookEvent', payload);
    expect(payload.data).toMatchObject({ keyword: 'STOP', phoneNumber: '+2348099999999' });
  });

  it('stores MMS attachments and serves them back', async () => {
    const image = Buffer.from('fake-png-bytes');
    const pushed = bodyOf<InboxPushResponse>(
      await request(ctx.http)
        .post(`${API}/device/inbox`)
        .set('Authorization', asDevice(device.token))
        .send({
          messages: [
            {
              localId: 'mms-1',
              type: 'mms',
              from: '+2348011111111',
              receivedAt: new Date().toISOString(),
              subject: 'Photo',
              attachments: [{ contentType: 'image/png', name: 'photo.png', data: image.toString('base64') }],
            },
          ],
        })
        .expect(200),
    );
    const id = pushed.results[0]!.id;
    const message = await request(ctx.http).get(`${API}/inbox/${id}`).set('Authorization', `Bearer ${apiKey}`).expect(200);
    const attachment = bodyOf<{ attachments: { id: string; size: number }[] }>(message).attachments[0]!;
    expect(attachment.size).toBe(image.length);
    const file = await request(ctx.http)
      .get(`${API}/inbox/${id}/attachments/${attachment.id}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-type']).toContain('image/png');
    expect(Buffer.compare(file.body as Buffer, image)).toBe(0);
  });

  it('cancels a scheduled message but not one already on the phone', async () => {
    const scheduled = messageOf(
      await sendSms(ctx.http, apiKey, { scheduleAt: new Date(Date.now() + 3_600_000).toISOString() }).expect(202),
    );
    expect(scheduled.state).toBe('scheduled');
    const cancelled = await request(ctx.http)
      .post(`${API}/messages/${scheduled.id}/cancel`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);
    expect(messageOf(cancelled).state).toBe('cancelled');
    await request(ctx.http).post(`${API}/messages/${scheduled.id}/cancel`).set('Authorization', `Bearer ${apiKey}`).expect(409);

    const live = messageOf(await sendSms(ctx.http, apiKey).expect(202));
    await request(ctx.http).post(`${API}/device/messages/pull`).set('Authorization', asDevice(device.token)).send({}).expect(200);
    await request(ctx.http)
      .post(`${API}/device/messages/states`)
      .set('Authorization', asDevice(device.token))
      .send({ reports: [{ messageId: live.id, state: 'queued', at: new Date().toISOString() }] })
      .expect(200);
    await request(ctx.http).post(`${API}/messages/${live.id}/cancel`).set('Authorization', `Bearer ${apiKey}`).expect(409);
  });

  it('tells the device when a leased message was cancelled', async () => {
    const message = messageOf(await sendSms(ctx.http, apiKey).expect(202));
    await request(ctx.http).post(`${API}/device/messages/pull`).set('Authorization', asDevice(device.token)).send({}).expect(200);
    await request(ctx.http).post(`${API}/messages/${message.id}/cancel`).set('Authorization', `Bearer ${apiKey}`).expect(200);
    const result = bodyOf<StateReportResponse>(
      await request(ctx.http)
        .post(`${API}/device/messages/states`)
        .set('Authorization', asDevice(device.token))
        .send({ reports: [{ messageId: message.id, state: 'sending', at: new Date().toISOString() }] })
        .expect(200),
    );
    expect(result.results[0]).toEqual({ messageId: message.id, status: 'rejected', reason: 'cancelled' });
  });

  it('reports failures with an error code and emits message.failed', async () => {
    const message = messageOf(await sendSms(ctx.http, apiKey).expect(202));
    await request(ctx.http).post(`${API}/device/messages/pull`).set('Authorization', asDevice(device.token)).send({}).expect(200);
    await request(ctx.http)
      .post(`${API}/device/messages/states`)
      .set('Authorization', asDevice(device.token))
      .send({ reports: [{ messageId: message.id, state: 'failed', at: new Date().toISOString() }] })
      .expect(400);
    await request(ctx.http)
      .post(`${API}/device/messages/states`)
      .set('Authorization', asDevice(device.token))
      .send({
        reports: [{ messageId: message.id, state: 'failed', at: new Date().toISOString(), error: { code: 'no_service', message: 'No service' } }],
      })
      .expect(200);
    const detail = bodyOf<MessageDetail>(
      await request(ctx.http).get(`${API}/messages/${message.id}`).set('Authorization', `Bearer ${apiKey}`).expect(200),
    );
    expect(detail.error).toEqual({ code: 'no_service', message: 'No service' });
    const failed = await waitFor(() => receiver.ofType('message.failed').find((hook) => hook.body.includes(message.id)));
    assertMatchesSchema('public', 'MessageWebhookEvent', JSON.parse(failed.body));
  });

  it('sends a test event, retries failures and redelivers on request', async () => {
    receiver.failNext(1);
    const queued = await request(ctx.http).post(`${API}/webhooks/${webhook.id}/test`).set('Authorization', `Bearer ${apiKey}`).expect(202);
    assertMatchesSchema('public', 'WebhookDelivery', queued.body);
    const test = await waitFor(() => receiver.ofType('webhook.test')[0]);
    assertMatchesSchema('public', 'TestWebhookEvent', JSON.parse(test.body));
    const deliveryId = bodyOf<{ id: string }>(queued).id;
    const settled = await waitFor(async () => {
      const page = bodyOf<WebhookDeliveryPage>(
        await request(ctx.http).get(`${API}/webhooks/${webhook.id}/deliveries`).set('Authorization', `Bearer ${apiKey}`),
      );
      const delivery = page.data.find((item) => item.id === deliveryId);
      return delivery?.status === 'succeeded' ? delivery : undefined;
    });
    expect(settled.attempts).toBe(2);

    await request(ctx.http)
      .post(`${API}/webhooks/${webhook.id}/deliveries/${deliveryId}/redeliver`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(202);
    await waitFor(() => (receiver.ofType('webhook.test').length >= 2 ? true : undefined));
    const [first, second] = receiver.ofType('webhook.test');
    expect(JSON.parse(first!.body)).toEqual(JSON.parse(second!.body));
  });

  it('reports usage for the dashboard', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const summary = await request(ctx.http).get(`${API}/usage/summary`).set('Authorization', `Bearer ${apiKey}`).expect(200);
    assertMatchesSchema('public', 'UsageSummary', summary.body);
    expect(bodyOf<{ today: { delivered: number; received: number } }>(summary).today).toMatchObject({ delivered: 1, received: 3 });
    const daily = await request(ctx.http)
      .get(`${API}/usage/daily?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);
    assertMatchesSchema('public', 'DailyUsageList', daily.body);
    const devices = await request(ctx.http)
      .get(`${API}/usage/devices?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);
    assertMatchesSchema('public', 'DeviceUsageList', devices.body);
    await request(ctx.http).get(`${API}/usage/daily?from=${today}&to=2020-01-01`).set('Authorization', `Bearer ${apiKey}`).expect(400);
  });

  it('removes a device and revokes its token', async () => {
    await request(ctx.http).delete(`${API}/devices/${device.id}`).set('Authorization', `Bearer ${apiKey}`).expect(204);
    await request(ctx.http).post(`${API}/device/heartbeat`).set('Authorization', asDevice(device.token)).send({}).expect(401);
    const devices = bodyOf<DeviceList>(await request(ctx.http).get(`${API}/devices`).set('Cookie', cookie).expect(200));
    expect(devices.data).toEqual([]);
  });
});
