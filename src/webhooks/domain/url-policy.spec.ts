import { BLOCKED_TARGET_MESSAGE, type DnsResolver, embeddedIpv4, isBlockedAddress, resolveDeliveryTarget, urlProtocolError } from './url-policy';

const strict = { allowHttp: false, allowPrivateTargets: false };
const fixed = (...addresses: string[]): DnsResolver => () =>
  Promise.resolve(addresses.map((address) => ({ address, family: address.includes(':') ? (6 as const) : (4 as const) })));

describe('webhook url policy', () => {
  it('requires https unless http is allowed', () => {
    expect(urlProtocolError('https://example.org/hook', strict)).toBeNull();
    expect(urlProtocolError('http://example.org/hook', strict)).toBe('url must use https');
    expect(urlProtocolError('http://example.org/hook', { allowHttp: true, allowPrivateTargets: false })).toBeNull();
    expect(urlProtocolError('ftp://example.org', { allowHttp: true, allowPrivateTargets: false })).toBe('url must use http or https');
  });

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::',
    '::1',
    'fd00::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a00:1',
    '::ffff:8.8.8.8',
    '0:0:0:0:0:ffff:c0a8:0101',
    '::127.0.0.1',
    '64:ff9b::a00:1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '2a00:1450:4001:80b::200e'])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('reads the IPv4 address inside mapped IPv6 forms', () => {
    expect(embeddedIpv4('::ffff:7f00:1')).toBe('127.0.0.1');
    expect(embeddedIpv4('::ffff:192.168.1.1')).toBe('192.168.1.1');
    expect(embeddedIpv4('2606:4700::1111')).toBeNull();
  });

  it('refuses literal private targets unless private targets are allowed', async () => {
    await expect(resolveDeliveryTarget('https://127.0.0.1/hook', strict, fixed())).rejects.toThrow(BLOCKED_TARGET_MESSAGE);
    await expect(resolveDeliveryTarget('https://[::ffff:7f00:1]/hook', strict, fixed())).rejects.toThrow(BLOCKED_TARGET_MESSAGE);
    const allowed = await resolveDeliveryTarget('https://127.0.0.1/hook', { allowHttp: false, allowPrivateTargets: true }, fixed());
    expect(allowed).toMatchObject({ address: '127.0.0.1', family: 4 });
  });

  it('refuses a host when any resolved address is private', async () => {
    await expect(resolveDeliveryTarget('https://hooks.example/x', strict, fixed('93.184.216.34', '10.0.0.5'))).rejects.toThrow(
      BLOCKED_TARGET_MESSAGE,
    );
    const target = await resolveDeliveryTarget('https://hooks.example/x', strict, fixed('93.184.216.34'));
    expect(target).toMatchObject({ hostname: 'hooks.example', address: '93.184.216.34', family: 4 });
  });

  it('resolves the host only once and keeps the first answer', async () => {
    const answers = ['93.184.216.34', '127.0.0.1'];
    const resolver = jest.fn<ReturnType<DnsResolver>, Parameters<DnsResolver>>(() =>
      Promise.resolve([{ address: answers.shift() ?? '127.0.0.1', family: 4 as const }]),
    );
    const target = await resolveDeliveryTarget('https://rebind.example/x', strict, resolver);
    expect(target.address).toBe('93.184.216.34');
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('fails when the host does not resolve', async () => {
    await expect(resolveDeliveryTarget('https://nowhere.example/x', strict, fixed())).rejects.toThrow('Could not resolve nowhere.example');
  });
});
