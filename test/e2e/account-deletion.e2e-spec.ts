import type { Session } from '@homing/contracts';
import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import { AccountDeletionService } from '@/accounts/account-deletion.service';
import { accounts, devices, messages, users } from '@/database/schema';
import { API, bodyOf, createApiKey, heartbeat, invite, joinTeam, pairDevice, PASSWORD, sendSms, signUp } from './api';
import { createTestApp, type TestContext } from './app';

describe('account deletion', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('needs the owner and the exact account name', async () => {
    const owner = await signUp(ctx.http);
    const admin = await joinTeam(ctx.http, owner.cookie, 'admin');
    await request(ctx.http).post(`${API}/account/deletion`).set('Cookie', admin.cookie).send({ accountName: 'Ada Shop' }).expect(403);
    const wrong = await request(ctx.http).post(`${API}/account/deletion`).set('Cookie', owner.cookie).send({ accountName: 'ada shop' }).expect(400);
    expect(bodyOf<{ message: string[] }>(wrong).message).toEqual(['accountName does not match the account name']);
    await request(ctx.http).post(`${API}/account/deletion`).set('Cookie', owner.cookie).send({}).expect(400);
    await request(ctx.http).get(`${API}/account`).set('Cookie', owner.cookie).expect(200);
  });

  it('revokes keys and device tokens, signs everyone out and deletes the data in the background', async () => {
    const owner = await signUp(ctx.http);
    const accountId = owner.session.account.id;
    const key = await createApiKey(ctx.http, owner.cookie, ['admin']);
    const device = await pairDevice(ctx.http, owner.cookie);
    await heartbeat(ctx.http, device.token);
    await sendSms(ctx.http, key).expect(202);
    const member = await joinTeam(ctx.http, owner.cookie, 'member');
    const other = await signUp(ctx.http);
    const shared = await invite(ctx.http, owner.cookie, 'admin', other.email);
    await request(ctx.http).post(`${API}/invites/${shared.token}/accept`).set('Cookie', other.cookie).expect(200);
    const pending = await invite(ctx.http, owner.cookie, 'member');

    const response = await request(ctx.http)
      .post(`${API}/account/deletion`)
      .set('Cookie', owner.cookie)
      .send({ accountName: 'Ada Shop' })
      .expect(202);
    expect(String(response.headers['set-cookie'])).toContain('homing_session=;');

    await request(ctx.http).get(`${API}/auth/me`).set('Cookie', owner.cookie).expect(401);
    await request(ctx.http).get(`${API}/auth/me`).set('Cookie', member.cookie).expect(401);
    await request(ctx.http).get(`${API}/messages`).set('Authorization', `Bearer ${key}`).expect(401);
    await request(ctx.http).post(`${API}/device/heartbeat`).set('Authorization', `Bearer ${device.token}`).send({}).expect(401);
    await request(ctx.http).get(`${API}/invites/${pending.token}`).expect(404);

    await ctx.app.get(AccountDeletionService).idle();
    const [left] = await ctx.database.db.select({ total: count() }).from(accounts).where(eq(accounts.id, accountId));
    expect(left?.total).toBe(0);
    const [orphanMessages] = await ctx.database.db.select({ total: count() }).from(messages).where(eq(messages.accountId, accountId));
    expect(orphanMessages?.total).toBe(0);
    const [orphanDevices] = await ctx.database.db.select({ total: count() }).from(devices).where(eq(devices.accountId, accountId));
    expect(orphanDevices?.total).toBe(0);

    const remaining = await ctx.database.db.select({ email: users.email }).from(users);
    const emails = remaining.map((row) => row.email);
    expect(emails).not.toContain(owner.email);
    expect(emails).not.toContain(member.email);
    expect(emails).toContain(other.email);
    await request(ctx.http).post(`${API}/auth/sign-in`).send({ email: owner.email, password: PASSWORD }).expect(401);
    const back = await request(ctx.http).post(`${API}/auth/sign-in`).send({ email: other.email, password: PASSWORD }).expect(200);
    const session = bodyOf<Session>(back);
    expect(session.account.id).toBe(other.session.account.id);
    expect(session.memberships.map((item) => item.accountId)).toEqual([other.session.account.id]);
  });

  it('finishes an interrupted purge from the maintenance sweep', async () => {
    const owner = await signUp(ctx.http);
    const accountId = owner.session.account.id;
    await ctx.database.db.update(accounts).set({ deletedAt: new Date(Date.now() - 120_000) }).where(eq(accounts.id, accountId));
    const report = await ctx.maintenance.sweep();
    expect(report?.purged).toBeGreaterThanOrEqual(1);
    const [left] = await ctx.database.db.select({ total: count() }).from(accounts).where(eq(accounts.id, accountId));
    expect(left?.total).toBe(0);
  });
});
