import type { InviteList, InvitePreview, Session, TeamMember, TeamMemberList } from '@homing/contracts';
import request from 'supertest';
import { API, bodyOf, invite, joinTeam, PASSWORD, sessionCookie, signUp } from './api';
import { createTestApp, type TestContext } from './app';
import { assertMatchesSchema } from './contract';

describe('team, roles and invites', () => {
  let ctx: TestContext;
  let ownerCookie: string;
  let ownerSession: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
    const owner = await signUp(ctx.http);
    ownerCookie = owner.cookie;
    ownerSession = owner.session;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates an invite with a one-time link and shows it to anyone holding the link', async () => {
    const { invite: created, token, email } = await invite(ctx.http, ownerCookie, 'admin');
    assertMatchesSchema('public', 'InviteWithLink', created);
    expect(created).toMatchObject({ email, role: 'admin', status: 'pending', invitedBy: 'Ada Owner' });
    expect(created.inviteUrl).toBe(`http://localhost:7011/invite/${token}`);
    expect(token.startsWith('hi_')).toBe(true);

    const preview = bodyOf<InvitePreview>(await request(ctx.http).get(`${API}/invites/${token}`).expect(200));
    assertMatchesSchema('public', 'InvitePreview', preview);
    expect(preview).toMatchObject({ accountName: 'Ada Shop', email, role: 'admin', invitedBy: 'Ada Owner' });

    const list = bodyOf<InviteList>(await request(ctx.http).get(`${API}/team/invites`).set('Cookie', ownerCookie).expect(200));
    assertMatchesSchema('public', 'InviteList', list);
    expect(JSON.stringify(list)).not.toContain(token);
    expect(list.data.map((item) => item.id)).toContain(created.id);
  });

  it('joins through sign-up only with the invited email and a live token', async () => {
    const { token, email } = await invite(ctx.http, ownerCookie, 'member');
    await request(ctx.http)
      .post(`${API}/auth/sign-up`)
      .send({ email: 'someone-else@example.com', password: PASSWORD, name: 'Wrong', inviteToken: token })
      .expect(403);
    await request(ctx.http)
      .post(`${API}/auth/sign-up`)
      .send({ email, password: PASSWORD, name: 'Bad token', inviteToken: 'hi_not-a-real-token' })
      .expect(400);
    const joined = await request(ctx.http)
      .post(`${API}/auth/sign-up`)
      .send({ email: email.toUpperCase(), password: PASSWORD, name: 'Mia Member', accountName: 'Ignored', inviteToken: token })
      .expect(201);
    const session = bodyOf<Session>(joined);
    assertMatchesSchema('public', 'Session', session);
    expect(session.account.id).toBe(ownerSession.account.id);
    expect(session.user.role).toBe('member');
    expect(session.memberships).toEqual([{ accountId: ownerSession.account.id, accountName: 'Ada Shop', role: 'member' }]);
    await request(ctx.http).get(`${API}/invites/${token}`).expect(404);
    await request(ctx.http)
      .post(`${API}/auth/sign-up`)
      .send({ email: `again-${email}`, password: PASSWORD, name: 'Reuse', inviteToken: token })
      .expect(400);
  });

  it('lets a signed-in user from another account accept and switch between accounts', async () => {
    const other = await signUp(ctx.http);
    const { token } = await invite(ctx.http, ownerCookie, 'admin', other.email);
    const stranger = await signUp(ctx.http);
    await request(ctx.http).post(`${API}/invites/${token}/accept`).set('Cookie', stranger.cookie).expect(403);
    await request(ctx.http).post(`${API}/invites/${token}/accept`).expect(401);

    const accepted = bodyOf<Session>(await request(ctx.http).post(`${API}/invites/${token}/accept`).set('Cookie', other.cookie).expect(200));
    assertMatchesSchema('public', 'Session', accepted);
    expect(accepted.account.id).toBe(ownerSession.account.id);
    expect(accepted.user.role).toBe('admin');
    expect(accepted.memberships.map((item) => item.accountId)).toEqual([other.session.account.id, ownerSession.account.id]);

    const me = bodyOf<Session>(await request(ctx.http).get(`${API}/auth/me`).set('Cookie', other.cookie).expect(200));
    expect(me.account.id).toBe(ownerSession.account.id);
    const switched = bodyOf<Session>(
      await request(ctx.http)
        .post(`${API}/auth/switch-account`)
        .set('Cookie', other.cookie)
        .send({ accountId: other.session.account.id })
        .expect(200),
    );
    expect(switched).toMatchObject({ account: { id: other.session.account.id }, user: { role: 'owner' } });
    await request(ctx.http)
      .post(`${API}/auth/switch-account`)
      .set('Cookie', other.cookie)
      .send({ accountId: stranger.session.account.id })
      .expect(404);

    const signedIn = await request(ctx.http).post(`${API}/auth/sign-in`).send({ email: other.email, password: PASSWORD }).expect(200);
    expect(bodyOf<Session>(signedIn).account.id).toBe(other.session.account.id);
  });

  it('replaces an open invite for the same email and refuses existing members', async () => {
    const first = await invite(ctx.http, ownerCookie, 'member', 'twice@example.com');
    const second = await invite(ctx.http, ownerCookie, 'admin', 'TWICE@example.com');
    await request(ctx.http).get(`${API}/invites/${first.token}`).expect(404);
    await request(ctx.http).get(`${API}/invites/${second.token}`).expect(200);
    await request(ctx.http)
      .post(`${API}/team/invites`)
      .set('Cookie', ownerCookie)
      .send({ email: ownerSession.user.email, role: 'member' })
      .expect(409);
    await request(ctx.http).post(`${API}/team/invites`).set('Cookie', ownerCookie).send({ email: 'x@example.com', role: 'owner' }).expect(400);
    await request(ctx.http).delete(`${API}/team/invites/${second.invite.id}`).set('Cookie', ownerCookie).expect(204);
    await request(ctx.http).get(`${API}/invites/${second.token}`).expect(404);
    await request(ctx.http).delete(`${API}/team/invites/${second.invite.id}`).set('Cookie', ownerCookie).expect(404);
  });

  it('enforces the role matrix on account, keys, webhooks, devices and team', async () => {
    const member = await joinTeam(ctx.http, ownerCookie, 'member');
    const admin = await joinTeam(ctx.http, ownerCookie, 'admin');
    const keyList = await request(ctx.http).get(`${API}/api-keys`).set('Cookie', ownerCookie).expect(200);
    expect(keyList.status).toBe(200);
    const created = await request(ctx.http).post(`${API}/api-keys`).set('Cookie', ownerCookie).send({ name: 'k', scopes: ['admin'] }).expect(201);
    const keyId = bodyOf<{ id: string }>(created).id;
    const webhook = await request(ctx.http)
      .post(`${API}/webhooks`)
      .set('Cookie', ownerCookie)
      .send({ url: 'https://hooks.example.org/x', events: ['message.sent'] })
      .expect(201);
    const webhookId = bodyOf<{ id: string }>(webhook).id;

    type Check = { name: string; call: (cookie: string) => request.Test; allowed: 'member' | 'admin' | 'owner' };
    const checks: Check[] = [
      { name: 'read account', allowed: 'member', call: (c) => request(ctx.http).get(`${API}/account`).set('Cookie', c) },
      { name: 'update account', allowed: 'admin', call: (c) => request(ctx.http).patch(`${API}/account`).set('Cookie', c).send({ routingStrategy: 'least_used' }) },
      { name: 'list keys', allowed: 'member', call: (c) => request(ctx.http).get(`${API}/api-keys`).set('Cookie', c) },
      { name: 'create key', allowed: 'admin', call: (c) => request(ctx.http).post(`${API}/api-keys`).set('Cookie', c).send({ name: 'x', scopes: ['messages:read'] }) },
      { name: 'revoke key', allowed: 'admin', call: (c) => request(ctx.http).delete(`${API}/api-keys/key_missing`).set('Cookie', c) },
      { name: 'list webhooks', allowed: 'member', call: (c) => request(ctx.http).get(`${API}/webhooks`).set('Cookie', c) },
      { name: 'create webhook', allowed: 'admin', call: (c) => request(ctx.http).post(`${API}/webhooks`).set('Cookie', c).send({ url: 'https://hooks.example.org/y', events: ['message.sent'] }) },
      { name: 'update webhook', allowed: 'admin', call: (c) => request(ctx.http).patch(`${API}/webhooks/${webhookId}`).set('Cookie', c).send({ enabled: true }) },
      { name: 'rotate webhook', allowed: 'admin', call: (c) => request(ctx.http).post(`${API}/webhooks/${webhookId}/rotate-secret`).set('Cookie', c) },
      { name: 'test webhook', allowed: 'admin', call: (c) => request(ctx.http).post(`${API}/webhooks/${webhookId}/test`).set('Cookie', c) },
      { name: 'delete webhook', allowed: 'admin', call: (c) => request(ctx.http).delete(`${API}/webhooks/whk_missing`).set('Cookie', c) },
      { name: 'list devices', allowed: 'member', call: (c) => request(ctx.http).get(`${API}/devices`).set('Cookie', c) },
      { name: 'pairing code', allowed: 'admin', call: (c) => request(ctx.http).post(`${API}/devices/pairing-codes`).set('Cookie', c).send({}) },
      { name: 'update device', allowed: 'admin', call: (c) => request(ctx.http).patch(`${API}/devices/dev_missing`).set('Cookie', c).send({ paused: true }) },
      { name: 'remove device', allowed: 'admin', call: (c) => request(ctx.http).delete(`${API}/devices/dev_missing`).set('Cookie', c) },
      { name: 'send message', allowed: 'member', call: (c) => request(ctx.http).post(`${API}/messages`).set('Cookie', c).send({ type: 'sms', to: '+2348012345678', text: 'hi' }) },
      { name: 'list members', allowed: 'member', call: (c) => request(ctx.http).get(`${API}/team/members`).set('Cookie', c) },
      { name: 'list invites', allowed: 'admin', call: (c) => request(ctx.http).get(`${API}/team/invites`).set('Cookie', c) },
      { name: 'invite', allowed: 'admin', call: (c) => request(ctx.http).post(`${API}/team/invites`).set('Cookie', c).send({ email: `m-${Date.now()}@example.com`, role: 'member' }) },
      { name: 'revoke invite', allowed: 'admin', call: (c) => request(ctx.http).delete(`${API}/team/invites/inv_missing`).set('Cookie', c) },
      { name: 'change role', allowed: 'admin', call: (c) => request(ctx.http).patch(`${API}/team/members/usr_missing`).set('Cookie', c).send({ role: 'member' }) },
      { name: 'delete account', allowed: 'owner', call: (c) => request(ctx.http).post(`${API}/account/deletion`).set('Cookie', c).send({ accountName: 'wrong name' }) },
    ];
    const rank = { member: 0, admin: 1, owner: 2 };
    const failures: string[] = [];
    for (const [role, cookie] of [['member', member.cookie], ['admin', admin.cookie], ['owner', ownerCookie]] as const) {
      for (const check of checks) {
        const response = await check.call(cookie);
        const expectedAllowed = rank[role] >= rank[check.allowed];
        if (expectedAllowed === (response.status === 403)) {
          failures.push(`${role} ${check.name}: ${response.status}`);
        }
      }
    }
    expect(failures).toEqual([]);
    await request(ctx.http).delete(`${API}/api-keys/${keyId}`).set('Cookie', admin.cookie).expect(204);
  });

  it('lets an admin manage members but keeps owners in control of owners', async () => {
    const admin = await joinTeam(ctx.http, ownerCookie, 'admin');
    const member = await joinTeam(ctx.http, ownerCookie, 'member');
    const promoted = bodyOf<TeamMember>(
      await request(ctx.http).patch(`${API}/team/members/${member.userId}`).set('Cookie', admin.cookie).send({ role: 'admin' }).expect(200),
    );
    assertMatchesSchema('public', 'TeamMember', promoted);
    expect(promoted.role).toBe('admin');
    await request(ctx.http).patch(`${API}/team/members/${member.userId}`).set('Cookie', admin.cookie).send({ role: 'owner' }).expect(403);
    await request(ctx.http).patch(`${API}/team/members/${ownerSession.user.id}`).set('Cookie', admin.cookie).send({ role: 'member' }).expect(403);
    await request(ctx.http).delete(`${API}/team/members/${ownerSession.user.id}`).set('Cookie', admin.cookie).expect(403);
    await request(ctx.http).patch(`${API}/team/members/${ownerSession.user.id}`).set('Cookie', ownerCookie).send({ role: 'admin' }).expect(409);
    await request(ctx.http).delete(`${API}/team/members/${ownerSession.user.id}`).set('Cookie', ownerCookie).expect(409);

    const me = bodyOf<Session>(await request(ctx.http).get(`${API}/auth/me`).set('Cookie', member.cookie).expect(200));
    expect(me.user.role).toBe('admin');

    await request(ctx.http).patch(`${API}/team/members/${admin.userId}`).set('Cookie', ownerCookie).send({ role: 'owner' }).expect(200);
    await request(ctx.http).patch(`${API}/team/members/${ownerSession.user.id}`).set('Cookie', admin.cookie).send({ role: 'owner' }).expect(200);
    await request(ctx.http).patch(`${API}/team/members/${admin.userId}`).set('Cookie', admin.cookie).send({ role: 'admin' }).expect(200);

    const members = bodyOf<TeamMemberList>(await request(ctx.http).get(`${API}/team/members`).set('Cookie', member.cookie).expect(200));
    assertMatchesSchema('public', 'TeamMemberList', members);
    expect(members.data[0]).toMatchObject({ userId: ownerSession.user.id, role: 'owner' });
  });

  it('removes a member, ends their sessions and deletes a user left with no account', async () => {
    const member = await joinTeam(ctx.http, ownerCookie, 'member');
    await request(ctx.http).delete(`${API}/team/members/${member.userId}`).set('Cookie', ownerCookie).expect(204);
    await request(ctx.http).get(`${API}/auth/me`).set('Cookie', member.cookie).expect(401);
    await request(ctx.http).post(`${API}/auth/sign-in`).send({ email: member.email, password: PASSWORD }).expect(401);
    await request(ctx.http).delete(`${API}/team/members/${member.userId}`).set('Cookie', ownerCookie).expect(404);
  });

  it('lets a member leave, and keeps a member from removing others', async () => {
    const member = await joinTeam(ctx.http, ownerCookie, 'member');
    const other = await joinTeam(ctx.http, ownerCookie, 'member');
    await request(ctx.http).delete(`${API}/team/members/${other.userId}`).set('Cookie', member.cookie).expect(403);
    await request(ctx.http).delete(`${API}/team/members/${member.userId}`).set('Cookie', member.cookie).expect(204);
    await request(ctx.http).get(`${API}/auth/me`).set('Cookie', member.cookie).expect(401);
  });

  it('keeps team endpoints away from API keys', async () => {
    const response = await request(ctx.http).post(`${API}/api-keys`).set('Cookie', ownerCookie).send({ name: 'admin', scopes: ['admin'] }).expect(201);
    const key = bodyOf<{ secret: string }>(response).secret;
    await request(ctx.http).get(`${API}/team/members`).set('Authorization', `Bearer ${key}`).expect(403);
    await request(ctx.http).post(`${API}/account/deletion`).set('Authorization', `Bearer ${key}`).send({ accountName: 'Ada Shop' }).expect(403);
    const signIn = await request(ctx.http).post(`${API}/auth/sign-in`).send({ email: ownerSession.user.email, password: PASSWORD }).expect(200);
    expect(sessionCookie(signIn)).toContain('homing_session=');
  });
});
