import { createHmac, timingSafeEqual } from 'node:crypto';
import { SIGNATURE_TOLERANCE_SECONDS } from './event-types';

export function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function buildSignatureHeader(secret: string, body: string, timestamp: number): string {
  return `t=${timestamp},v1=${computeSignature(secret, timestamp, body)}`;
}

export function verifySignatureHeader(
  header: string,
  body: string,
  secret: string,
  nowSeconds: number,
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  const parts = header.split(',').map((part) => {
    const index = part.indexOf('=');
    return index === -1 ? ['', ''] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  });
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }
  const expected = Buffer.from(computeSignature(secret, timestamp, body));
  return parts
    .filter(([key]) => key === 'v1')
    .some(([, value]) => {
      const candidate = Buffer.from(value ?? '');
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    });
}
