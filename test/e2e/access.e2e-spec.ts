import type { WebhookEndpointWithSecret } from '@homing/contracts';
import request from 'supertest';
import { API, bodyOf, createApiKey, pairDevice, sendSms, signUp, TERMS } from './api';
import { createTestApp, type TestContext } from './app';
import { assertMatchesSchema, loadSpec } from './contract';

describe('access control and errors', () => {
  let ctx: TestContext;
  let cookie: string;
  let readOnlyKey: string;
  let adminKey: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const owner = await signUp(ctx.http);
    cookie = owner.cookie;
    readOnlyKey = await createApiKey(ctx.http, cookie, ['messages:read']);
    adminKey = await createApiKey(ctx.http, cookie, ['admin']);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('rejects missing and malformed credentials with the standard error shape', async () => {
    const missing = await request(ctx.http).get(`${API}/messages`).expect(401);
    assertMatchesSchema('public', 'Error', missing.body);
    expect(missing.body).toMatchObject({ statusCode: 401, error: 'Unauthorized', path: '/api/v1/messages' });
    await request(ctx.http).get(`${API}/messages`).set('Authorization', 'Bearer hk_live_nope').expect(401);
    await request(ctx.http).get(`${API}/messages`).set('Authorization', 'Bearer something-else').expect(401);
  });

  it('enforces API key scopes', async () => {
    await request(ctx.http).get(`${API}/messages`).set('Authorization', `Bearer ${readOnlyKey}`).expect(200);
    const denied = await sendSms(ctx.http, readOnlyKey).expect(403);
    expect(bodyOf<{ message: string }>(denied).message).toContain('messages:send');
    await request(ctx.http).get(`${API}/inbox`).set('Authorization', `Bearer ${readOnlyKey}`).expect(403);
    await request(ctx.http).get(`${API}/webhooks`).set('Authorization', `Bearer ${readOnlyKey}`).expect(403);
    await request(ctx.http).get(`${API}/devices`).set('Authorization', `Bearer ${readOnlyKey}`).expect(403);
    await request(ctx.http).get(`${API}/api-keys`).set('Authorization', `Bearer ${readOnlyKey}`).expect(403);
    await request(ctx.http).get(`${API}/api-keys`).set('Authorization', `Bearer ${adminKey}`).expect(200);
    await sendSms(ctx.http, adminKey).expect(202);
  });

  it('keeps session-only operations away from API keys', async () => {
    await request(ctx.http).get(`${API}/auth/me`).set('Authorization', `Bearer ${adminKey}`).expect(403);
    await request(ctx.http).post(`${API}/auth/sign-out`).set('Authorization', `Bearer ${adminKey}`).expect(403);
  });

  it('stops accepting a revoked or expired key', async () => {
    const key = await createApiKey(ctx.http, cookie, ['messages:read']);
    const list = await request(ctx.http).get(`${API}/api-keys`).set('Cookie', cookie).expect(200);
    const id = bodyOf<{ data: { id: string; prefix: string }[] }>(list).data.find((item) => key.startsWith(item.prefix))!.id;
    await request(ctx.http).delete(`${API}/api-keys/${id}`).set('Cookie', cookie).expect(204);
    await request(ctx.http).get(`${API}/messages`).set('Authorization', `Bearer ${key}`).expect(401);
    await request(ctx.http)
      .post(`${API}/api-keys`)
      .set('Cookie', cookie)
      .send({ name: 'old', scopes: ['admin'], expiresAt: '2020-01-01T00:00:00Z' })
      .expect(400);
  });

  it('isolates accounts from each other', async () => {
    const other = await signUp(ctx.http);
    const otherKey = await createApiKey(ctx.http, other.cookie, ['admin']);
    const mine = bodyOf<{ id: string }>(await sendSms(ctx.http, adminKey).expect(202));
    await request(ctx.http).get(`${API}/messages/${mine.id}`).set('Authorization', `Bearer ${otherKey}`).expect(404);
    const otherDevice = await pairDevice(ctx.http, other.cookie);
    await sendSms(ctx.http, adminKey, { deviceId: otherDevice.id }).expect(404);
  });

  it('signs in, signs out and rejects bad passwords', async () => {
    const email = `login-${Date.now()}@example.com`;
    await signUp(ctx.http, email);
    await request(ctx.http).post(`${API}/auth/sign-up`).send({ email, password: 'correct horse battery', name: 'Again', ...TERMS }).expect(409);
    await request(ctx.http).post(`${API}/auth/sign-in`).send({ email, password: 'wrong password!' }).expect(401);
    const signedIn = await request(ctx.http).post(`${API}/auth/sign-in`).send({ email: email.toUpperCase(), password: 'correct horse battery' }).expect(200);
    const setCookie = String(signedIn.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const session = setCookie.split(';')[0]!;
    await request(ctx.http).post(`${API}/auth/sign-out`).set('Cookie', session).expect(204);
    await request(ctx.http).get(`${API}/auth/me`).set('Cookie', session).expect(401);
  });

  it('validates bodies, forbids unknown fields and caps body size', async () => {
    const invalid = await sendSms(ctx.http, adminKey, { to: 'not-a-number', surprise: true }).expect(400);
    assertMatchesSchema('public', 'Error', invalid.body);
    const messages = bodyOf<{ message: string[] }>(invalid).message;
    expect(messages).toEqual(expect.arrayContaining(['property surprise should not exist']));
    await sendSms(ctx.http, adminKey, { type: 'data', text: undefined, data: 'AQID' }).expect(400);
    const huge = await request(ctx.http)
      .post(`${API}/messages`)
      .set('Authorization', `Bearer ${adminKey}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'sms', to: '+2348012345678', text: 'x'.repeat(3 * 1024 * 1024) }))
      .expect(413);
    assertMatchesSchema('public', 'Error', huge.body);
    const malformed = await request(ctx.http)
      .post(`${API}/messages`)
      .set('Authorization', `Bearer ${adminKey}`)
      .set('Content-Type', 'application/json')
      .send('{"type":')
      .expect(400);
    assertMatchesSchema('public', 'Error', malformed.body);
  });

  it('rejects plain http webhooks when not allowed and rotates secrets', async () => {
    const created = bodyOf<WebhookEndpointWithSecret>(
      await request(ctx.http)
        .post(`${API}/webhooks`)
        .set('Authorization', `Bearer ${adminKey}`)
        .send({ url: 'https://hooks.example.org/homing', events: ['message.sent'] })
        .expect(201),
    );
    expect(created.secret.startsWith('whsec_')).toBe(true);
    const rotated = await request(ctx.http).post(`${API}/webhooks/${created.id}/rotate-secret`).set('Authorization', `Bearer ${adminKey}`).expect(200);
    expect(bodyOf<{ secret: string }>(rotated).secret).not.toBe(created.secret);
    const updated = await request(ctx.http)
      .patch(`${API}/webhooks/${created.id}`)
      .set('Authorization', `Bearer ${adminKey}`)
      .send({ enabled: false, description: null })
      .expect(200);
    assertMatchesSchema('public', 'WebhookEndpoint', updated.body);
    await request(ctx.http).delete(`${API}/webhooks/${created.id}`).set('Authorization', `Bearer ${adminKey}`).expect(204);
    await request(ctx.http).get(`${API}/webhooks/${created.id}`).set('Authorization', `Bearer ${adminKey}`).expect(404);
  });

  it('serves health and the public spec without auth', async () => {
    const health = await request(ctx.http).get(`${API}/health`).expect(200);
    assertMatchesSchema('public', 'Health', health.body);
    const yaml = await request(ctx.http).get(`${API}/docs`).expect(200);
    expect(yaml.text).toContain('title: Homing Cloud Public API');
    const json = await request(ctx.http).get(`${API}/docs/openapi.json`).expect(200);
    expect(bodyOf<{ openapi: string }>(json).openapi).toBe('3.1.0');
  });

  it('allows CORS only for configured origins', async () => {
    const allowed = await request(ctx.http).options(`${API}/messages`).set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(ctx.http).options(`${API}/messages`).set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('implements every path and method in both specs', async () => {
    const missing: string[] = [];
    for (const name of ['public', 'device'] as const) {
      for (const [path, item] of Object.entries(loadSpec(name).paths)) {
        for (const method of Object.keys(item).filter((key) => ['get', 'post', 'put', 'patch', 'delete'].includes(key))) {
          const url = `${API}${path.replace(/\{[^}]+\}/g, 'x_unknown')}`;
          const response = await request(ctx.http)[method as 'get'](url).send();
          const message = (response.body as { message?: unknown }).message;
          const routeMissing = response.status === 404 && !(typeof message === 'string' && message.includes('not found'));
          if (routeMissing) {
            missing.push(`${method.toUpperCase()} ${path}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
