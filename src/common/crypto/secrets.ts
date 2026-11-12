import { createHash, createHmac } from 'node:crypto';
import { customAlphabet } from 'nanoid';

const secretAlphabet = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  40,
);
const pairingAlphabet = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);

export function randomSecret(): string {
  return secretAlphabet();
}

export function randomPairingCode(): string {
  const raw = pairingAlphabet();
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizePairingCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function hashSecret(pepper: string, value: string): string {
  return createHmac('sha256', pepper).update(value).digest('hex');
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
