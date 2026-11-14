import type {
  ApiKeyWithSecret,
  HeartbeatResponse,
  InviteRole,
  InviteWithLink,
  MessageDetail,
  PairResponse,
  PairingCode,
  Session,
} from '@homing/contracts';
import { nanoid } from 'nanoid';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { CURRENT_TERMS_VERSION } from '@/accounts/terms';

export const API = '/api/v1';

export const TERMS = { acceptTerms: true, termsVersion: CURRENT_TERMS_VERSION } as const;

export function bodyOf<T>(response: Response): T {
  return response.body as T;
}

export function sessionCookie(response: Response): string {
  const header = response.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const cookie = cookies.find((value) => value.startsWith('homing_session='));
  if (!cookie) {
    throw new Error('No session cookie');
  }
  return cookie.split(';')[0]!;
}

export async function signUp(http: App, email = `owner-${nanoid(6).toLowerCase()}@example.com`) {
  const response = await request(http)
    .post(`${API}/auth/sign-up`)
    .send({ email, password: 'correct horse battery', name: 'Ada Owner', accountName: 'Ada Shop', ...TERMS })
    .expect(201);
  return { cookie: sessionCookie(response), session: bodyOf<Session>(response), response, email };
}

export async function createApiKey(http: App, cookie: string, scopes: string[]): Promise<string> {
  const response = await request(http)
    .post(`${API}/api-keys`)
    .set('Cookie', cookie)
    .send({ name: `key ${scopes.join(' ')}`, scopes })
    .expect(201);
  return bodyOf<ApiKeyWithSecret>(response).secret;
}

export async function pairDevice(http: App, cookie: string, name = 'Phone', sims = [0, 1]) {
  const code = bodyOf<PairingCode>(
    await request(http).post(`${API}/devices/pairing-codes`).set('Cookie', cookie).send({ deviceName: name }).expect(201),
  );
  const response = await request(http)
    .post(`${API}/device/pair`)
    .send({
      code: code.code.toLowerCase(),
      model: 'Pixel 8',
      manufacturer: 'Google',
      osVersion: '15',
      appVersion: '1.0.0',
      sims: sims.map((slot) => ({ slot, carrier: `Carrier ${slot}`, phoneNumber: `+23480000000${slot}` })),
    })
    .expect(201);
  const paired = bodyOf<PairResponse>(response);
  return { id: paired.deviceId, token: paired.deviceToken, paired, code };
}

export async function heartbeat(http: App, token: string, sims = [0, 1]): Promise<HeartbeatResponse> {
  const response = await request(http)
    .post(`${API}/device/heartbeat`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      appVersion: '1.0.1',
      battery: { level: 80, charging: true },
      network: { type: 'wifi' },
      sims: sims.map((slot) => ({ slot, carrier: `Carrier ${slot}`, signalLevel: 3, sentToday: 0 })),
      localQueueSize: 0,
    })
    .expect(200);
  return bodyOf<HeartbeatResponse>(response);
}

export function sendSms(http: App, apiKey: string, body: Record<string, unknown> = {}) {
  return request(http)
    .post(`${API}/messages`)
    .set('Authorization', `Bearer ${apiKey}`)
    .send({ type: 'sms', to: '+2348012345678', text: 'Hello from Homing', ...body });
}

export function messageOf(response: Response): MessageDetail {
  return bodyOf<MessageDetail>(response);
}

export const PASSWORD = 'correct horse battery';

export function inviteToken(invite: InviteWithLink): string {
  return invite.inviteUrl.split('/invite/')[1]!;
}

export async function invite(http: App, cookie: string, role: InviteRole, email = `teammate-${nanoid(6).toLowerCase()}@example.com`) {
  const response = await request(http).post(`${API}/team/invites`).set('Cookie', cookie).send({ email, role }).expect(201);
  const created = bodyOf<InviteWithLink>(response);
  return { invite: created, token: inviteToken(created), email };
}

export async function joinTeam(http: App, ownerCookie: string, role: InviteRole) {
  const { token, email } = await invite(http, ownerCookie, role);
  const response = await request(http)
    .post(`${API}/auth/sign-up`)
    .send({ email, password: PASSWORD, name: `Team ${role}`, inviteToken: token, ...TERMS })
    .expect(201);
  const session = bodyOf<Session>(response);
  return { cookie: sessionCookie(response), session, email, userId: session.user.id };
}
