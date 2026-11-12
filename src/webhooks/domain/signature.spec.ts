import { createHmac } from 'node:crypto';
import { retryDelayMs } from './backoff';
import { buildSignatureHeader, computeSignature, verifySignatureHeader } from './signature';

const secret = 'whsec_testsecret';
const body = JSON.stringify({ id: 'evt_1', type: 'message.sent', data: { message: { id: 'msg_1' } } });

describe('webhook signatures', () => {
  it('signs "<timestamp>.<body>" with HMAC-SHA256 hex', () => {
    const expected = createHmac('sha256', secret).update(`1700000000.${body}`).digest('hex');
    expect(computeSignature(secret, 1700000000, body)).toBe(expected);
    expect(buildSignatureHeader(secret, body, 1700000000)).toBe(`t=1700000000,v1=${expected}`);
  });

  it('verifies a fresh signature', () => {
    const header = buildSignatureHeader(secret, body, 1700000000);
    expect(verifySignatureHeader(header, body, secret, 1700000100)).toBe(true);
  });

  it('rejects tampered bodies, wrong secrets and stale timestamps', () => {
    const header = buildSignatureHeader(secret, body, 1700000000);
    expect(verifySignatureHeader(header, `${body} `, secret, 1700000000)).toBe(false);
    expect(verifySignatureHeader(header, body, 'whsec_other', 1700000000)).toBe(false);
    expect(verifySignatureHeader(header, body, secret, 1700000301)).toBe(false);
    expect(verifySignatureHeader('v1=abc', body, secret, 1700000000)).toBe(false);
  });

  it('accepts any matching v1 value during rotation', () => {
    const valid = computeSignature(secret, 1700000000, body);
    expect(verifySignatureHeader(`t=1700000000,v1=deadbeef,v1=${valid}`, body, secret, 1700000000)).toBe(true);
  });
});

describe('retryDelayMs', () => {
  it('doubles from the base delay', () => {
    expect([1, 2, 3, 4, 7].map((attempt) => retryDelayMs(attempt, 60_000))).toEqual([60_000, 120_000, 240_000, 480_000, 3_840_000]);
  });
});
