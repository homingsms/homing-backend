import type { ApiError, Session } from '@homing/contracts';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { CURRENT_TERMS_VERSION } from '@/accounts/terms';
import { users } from '@/database/schema';
import { API, bodyOf, createApiKey, invite, PASSWORD, signUp, TERMS } from './api';
import { createTestApp, type TestContext } from './app';
import { assertMatchesSchema } from './contract';

const USER_AGENT = 'TermsTest/1.0 (e2e)';

function newEmail(label: string): string {
  return `${label}-${nanoid(6).toLowerCase()}@example.com`;
}

describe('terms acceptance', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function storedTerms(userId: string) {
    const [row] = await ctx.database.db
      .select({
        version: users.termsVersion,
        acceptedAt: users.termsAcceptedAt,
        ip: users.termsAcceptedIp,
        userAgent: users.termsAcceptedUserAgent,
      })
      .from(users)
      .where(eq(users.id, userId));
    return row!;
  }

  async function userByEmail(email: string) {
    return ctx.database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  }

  it('rejects sign up without accepting the terms', async () => {
    const email = newEmail('no-terms');
    const missing = await request(ctx.http)
      .post(`${API}/auth/sign-up`)
      .send({ email, password: PASSWORD, name: 'No Terms' })
      .expect(400);
    assertMatchesSchema('public', 'Error', missing.body);
    expect(bodyOf<ApiError>(missing).code).toBe('terms_not_accepted');

    const declined = await request(ctx.http)
      .post(`${API}/auth/sign-up`)
      .send({ email, password: PASSWORD, name: 'No Terms', acceptTerms: false, termsVersion: CURRENT_TERMS_VERSION })
      .expect(400);
    expect(bodyOf<ApiError>(declined).code).toBe('terms_not_accepted');
    expect(await userByEmail(email)).toEqual([]);
  });

  it('rejects sign up with an old or missing terms version', async () => {
    const email = newEmail('old-terms');
    const old = await request(ctx.http)
      .post(`${API}/auth/sign-up`)
      .send({ email, password: PASSWORD, name: 'Old Terms', acceptTerms: true, termsVersion: '2020-01-01' })
      .expect(400);
    assertMatchesSchema('public', 'Error', old.body);
    expect(bodyOf<ApiError>(old).code).toBe('terms_version_mismatch');

    const missing = await request(ctx.http)
      .post(`${API}/auth/sign-up`)
      .send({ email, password: PASSWORD, name: 'Old Terms', acceptTerms: true })
      .expect(400);
    expect(bodyOf<ApiError>(missing).code).toBe('terms_version_mismatch');
    expect(await userByEmail(email)).toEqual([]);
  });

  it('stores the version, time, IP and user agent on sign up', async () => {
    const before = Date.now();
    const response = await request(ctx.http)
      .post(`${API}/auth/sign-up`)
      .set('User-Agent', USER_AGENT)
      .send({ email: newEmail('accepts'), password: PASSWORD, name: 'Accepts', ...TERMS })
      .expect(201);
    const session = bodyOf<Session>(response);
    assertMatchesSchema('public', 'Session', session);
    expect(session.user.termsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(session.currentTermsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(session.termsAcceptanceRequired).toBe(false);

    const stored = await storedTerms(session.user.id);
    expect(stored.version).toBe(CURRENT_TERMS_VERSION);
    expect(stored.acceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(session.user.termsAcceptedAt).toBe(stored.acceptedAt!.toISOString());
    expect(stored.ip).toMatch(/127\.0\.0\.1|::1/);
    expect(stored.userAgent).toBe(USER_AGENT);
  });

  it('needs the terms when joining through an invite and records them', async () => {
    const owner = await signUp(ctx.http);
    const { token, email } = await invite(ctx.http, owner.cookie, 'member');
    const refused = await request(ctx.http)
      .post(`${API}/auth/sign-up`)
      .send({ email, password: PASSWORD, name: 'Invited', inviteToken: token })
      .expect(400);
    expect(bodyOf<ApiError>(refused).code).toBe('terms_not_accepted');
    await request(ctx.http).get(`${API}/invites/${token}`).expect(200);

    const joined = bodyOf<Session>(
      await request(ctx.http)
        .post(`${API}/auth/sign-up`)
        .set('User-Agent', USER_AGENT)
        .send({ email, password: PASSWORD, name: 'Invited', inviteToken: token, ...TERMS })
        .expect(201),
    );
    expect(joined.account.id).toBe(owner.session.account.id);
    expect(joined.termsAcceptanceRequired).toBe(false);
    const stored = await storedTerms(joined.user.id);
    expect(stored).toMatchObject({ version: CURRENT_TERMS_VERSION, userAgent: USER_AGENT });
  });

  it('flags users on an old version in /auth/me and lets them accept the current one', async () => {
    const owner = await signUp(ctx.http);
    await ctx.database.db
      .update(users)
      .set({ termsVersion: '2025-01-01', termsAcceptedAt: new Date('2025-01-01T00:00:00Z') })
      .where(eq(users.id, owner.session.user.id));

    const stale = bodyOf<Session>(await request(ctx.http).get(`${API}/auth/me`).set('Cookie', owner.cookie).expect(200));
    assertMatchesSchema('public', 'Session', stale);
    expect(stale.termsAcceptanceRequired).toBe(true);
    expect(stale.currentTermsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(stale.user.termsVersion).toBe('2025-01-01');
    expect(stale.user.termsAcceptedAt).toBe('2025-01-01T00:00:00.000Z');

    const wrong = await request(ctx.http)
      .post(`${API}/account/terms`)
      .set('Cookie', owner.cookie)
      .send({ version: '2025-01-01' })
      .expect(400);
    assertMatchesSchema('public', 'Error', wrong.body);
    expect(bodyOf<ApiError>(wrong).code).toBe('terms_version_mismatch');
    await request(ctx.http).post(`${API}/account/terms`).set('Cookie', owner.cookie).send({}).expect(400);

    const accepted = bodyOf<Session>(
      await request(ctx.http)
        .post(`${API}/account/terms`)
        .set('Cookie', owner.cookie)
        .set('User-Agent', USER_AGENT)
        .send({ version: CURRENT_TERMS_VERSION })
        .expect(200),
    );
    assertMatchesSchema('public', 'Session', accepted);
    expect(accepted.termsAcceptanceRequired).toBe(false);
    expect(accepted.user.termsVersion).toBe(CURRENT_TERMS_VERSION);
    const stored = await storedTerms(owner.session.user.id);
    expect(stored).toMatchObject({ version: CURRENT_TERMS_VERSION, userAgent: USER_AGENT });

    const again = bodyOf<Session>(
      await request(ctx.http)
        .post(`${API}/account/terms`)
        .set('Cookie', owner.cookie)
        .send({ version: CURRENT_TERMS_VERSION })
        .expect(200),
    );
    expect(again.user.termsAcceptedAt).toBe(accepted.user.termsAcceptedAt);

    const me = bodyOf<Session>(await request(ctx.http).get(`${API}/auth/me`).set('Cookie', owner.cookie).expect(200));
    expect(me.termsAcceptanceRequired).toBe(false);
  });

  it('flags users who never accepted any version', async () => {
    const owner = await signUp(ctx.http);
    await ctx.database.db
      .update(users)
      .set({ termsVersion: null, termsAcceptedAt: null, termsAcceptedIp: null, termsAcceptedUserAgent: null })
      .where(eq(users.id, owner.session.user.id));
    const me = bodyOf<Session>(await request(ctx.http).get(`${API}/auth/me`).set('Cookie', owner.cookie).expect(200));
    assertMatchesSchema('public', 'Session', me);
    expect(me.termsAcceptanceRequired).toBe(true);
    expect(me.user.termsVersion).toBeNull();
    expect(me.user.termsAcceptedAt).toBeNull();
  });

  it('accepts terms only from a console session', async () => {
    const owner = await signUp(ctx.http);
    const key = await createApiKey(ctx.http, owner.cookie, ['admin']);
    await request(ctx.http).post(`${API}/account/terms`).send({ version: CURRENT_TERMS_VERSION }).expect(401);
    await request(ctx.http)
      .post(`${API}/account/terms`)
      .set('Authorization', `Bearer ${key}`)
      .send({ version: CURRENT_TERMS_VERSION })
      .expect(403);
  });
});
