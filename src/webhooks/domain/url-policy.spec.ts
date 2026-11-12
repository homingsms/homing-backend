import { assertDeliverableTarget, isBlockedAddress, urlProtocolError } from './url-policy';

describe('webhook url policy', () => {
  it('requires https unless http is allowed', () => {
    expect(urlProtocolError('https://example.org/hook', { allowHttp: false, allowPrivateTargets: false })).toBeNull();
    expect(urlProtocolError('http://example.org/hook', { allowHttp: false, allowPrivateTargets: false })).toBe('url must use https');
    expect(urlProtocolError('http://example.org/hook', { allowHttp: true, allowPrivateTargets: false })).toBeNull();
    expect(urlProtocolError('ftp://example.org', { allowHttp: true, allowPrivateTargets: false })).toBe('url must use http or https');
  });

  it('blocks private, loopback and metadata addresses', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.10', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(isBlockedAddress(address)).toBe(true);
    }
    for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
      expect(isBlockedAddress(address)).toBe(false);
    }
  });

  it('refuses literal private targets at delivery time', async () => {
    await expect(assertDeliverableTarget('https://127.0.0.1/hook', { allowHttp: false, allowPrivateTargets: false })).rejects.toThrow(
      'private or reserved',
    );
    await expect(assertDeliverableTarget('https://127.0.0.1/hook', { allowHttp: false, allowPrivateTargets: true })).resolves.toBeUndefined();
  });
});
