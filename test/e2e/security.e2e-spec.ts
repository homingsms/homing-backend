import type { WebhookDelivery } from '@homing/contracts';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { API, bodyOf, signUp } from './api';
import { createTestApp, type TestContext } from './app';
import { waitFor, WebhookReceiver } from './webhook-receiver';

describe('rate limits, webhook targets and CORS', () => {
  let main: TestContext;
  let replicaA: TestContext;
  let replicaB: TestContext;
  const receiver = new WebhookReceiver();
  const lookups: string[] = [];

  beforeAll(async () => {
    main = await createTestApp({
      config: {
        NODE_ENV: 'development',
        CORS_ORIGINS: undefined,
        WEBHOOK_ALLOW_PRIVATE_TARGETS: false,
        WEBHOOK_MAX_ATTEMPTS: 1,
      },
      resolver: (hostname) => {
        lookups.push(hostname);
        return Promise.resolve([{ address: '127.0.0.1', family: 4 }]);
      },
    });
    const shared = { AUTH_THROTTLE_LIMIT: 3, QUEUE_PREFIX: `homing-test-rl-${nanoid(6)}` };
    replicaA = await createTestApp({ config: shared, reset: false });
    replicaB = await createTestApp({ config: shared, reset: false });
  });

  afterAll(async () => {
    await replicaA.close();
    await replicaB.close();
    await main.close();
    await receiver.stop();
  });

  it('shares rate limit counters across replicas through Redis', async () => {
    const attempt = (ctx: TestContext) =>
      request(ctx.http).post(`${API}/auth/sign-in`).send({ email: 'nobody@example.com', password: 'wrong password' });
    expect((await attempt(replicaA)).status).toBe(401);
    expect((await attempt(replicaB)).status).toBe(401);
    expect((await attempt(replicaA)).status).toBe(401);
    const limited = await attempt(replicaB);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect((await attempt(replicaA)).status).toBe(429);
  });

  it('refuses to deliver to a host that resolves to a private address', async () => {
    const owner = await signUp(main.http);
    const port = new URL(await receiver.start()).port;
    const created = await request(main.http)
      .post(`${API}/webhooks`)
      .set('Cookie', owner.cookie)
      .send({ url: `http://internal.test:${port}/hooks`, events: ['message.sent'] })
      .expect(201);
    const id = bodyOf<{ id: string }>(created).id;
    const queued = bodyOf<WebhookDelivery>(await request(main.http).post(`${API}/webhooks/${id}/test`).set('Cookie', owner.cookie).expect(202));
    const failed = await waitFor(async () => {
      const page = await request(main.http).get(`${API}/webhooks/${id}/deliveries`).set('Cookie', owner.cookie);
      const delivery = bodyOf<{ data: WebhookDelivery[] }>(page).data.find((item) => item.id === queued.id);
      return delivery?.status === 'failed' ? delivery : undefined;
    });
    expect(failed.lastError).toBe('Webhook target resolves to a private or reserved address');
    expect(failed.lastStatusCode).toBeNull();
    expect(receiver.received).toHaveLength(0);
    expect(lookups).toEqual(['internal.test']);
  });

  it('allows the local console origin by default in development', async () => {
    const allowed = await request(main.http)
      .options(`${API}/messages`)
      .set('Origin', 'http://localhost:7011')
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:7011');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const other = await request(main.http)
      .options(`${API}/messages`)
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
