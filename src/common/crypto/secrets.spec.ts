import { generateApiKeySecret } from '@/api-keys/api-keys.service';
import { API_KEY_DISPLAY_LENGTH } from '@/common/auth/constants';
import { decryptString, encryptString } from './encryption';
import { hashSecret, normalizePairingCode, randomPairingCode } from './secrets';

const pepper = 'a'.repeat(32);

describe('API key hashing', () => {
  it('creates hk_live_ keys with a display prefix', () => {
    const { secret, prefix } = generateApiKeySecret();
    expect(secret).toMatch(/^hk_live_[0-9A-Za-z]{40}$/);
    expect(prefix).toBe(secret.slice(0, API_KEY_DISPLAY_LENGTH));
    expect(generateApiKeySecret().secret).not.toBe(secret);
  });

  it('hashes deterministically with the pepper and never returns the input', () => {
    const { secret } = generateApiKeySecret();
    const hash = hashSecret(pepper, secret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(pepper, secret)).toBe(hash);
    expect(hashSecret('b'.repeat(32), secret)).not.toBe(hash);
    expect(hash).not.toContain(secret);
  });
});

describe('pairing codes', () => {
  it('formats and normalizes codes', () => {
    const code = randomPairingCode();
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(normalizePairingCode(code.toLowerCase())).toBe(code.replace('-', ''));
  });
});

describe('secret encryption', () => {
  const key = '0f'.repeat(32);

  it('round trips and uses a fresh IV each time', () => {
    const first = encryptString(key, 'whsec_abc');
    expect(first).not.toBe(encryptString(key, 'whsec_abc'));
    expect(decryptString(key, first)).toBe('whsec_abc');
  });

  it('rejects tampered ciphertext', () => {
    const [version, iv, tag, data] = encryptString(key, 'whsec_abc').split('.');
    const tampered = [version, iv, tag, Buffer.from('nope').toString('base64')].join('.');
    expect(() => decryptString(key, tampered)).toThrow();
    expect(data).toBeDefined();
  });
});
