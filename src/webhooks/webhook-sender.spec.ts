import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { BLOCKED_TARGET_MESSAGE, type DnsResolver } from './domain/url-policy';
import { pinnedLookup, WebhookSender } from './webhook-sender';

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

describe('WebhookSender', () => {
  let server: Server;
  let port: number;
  const received: Received[] = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received.push({ headers: request.headers, body: Buffer.concat(chunks).toString('utf8') });
        response.writeHead(request.url === '/fail' ? 500 : 200).end('x'.repeat(4096));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    received.length = 0;
  });

  it('answers the pinned address for any lookup style', () => {
    const lookup = pinnedLookup('203.0.113.7', 4);
    const single = jest.fn();
    lookup('anything.example', { family: 0 }, single);
    expect(single).toHaveBeenCalledWith(null, '203.0.113.7', 4);
    const all = jest.fn();
    lookup('anything.example', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: '203.0.113.7', family: 4 }]);
  });

  it('connects to the address it checked, so a DNS rebind after the check cannot redirect the request', async () => {
    const answers = ['127.0.0.1', '192.0.2.10'];
    const resolver = jest.fn<ReturnType<DnsResolver>, Parameters<DnsResolver>>(() =>
      Promise.resolve([{ address: answers.shift() ?? '192.0.2.10', family: 4 as const }]),
    );
    const sender = new WebhookSender(resolver);
    const result = await sender.send(
      `http://rebind.test:${port}/hook?x=1`,
      '{"ok":true}',
      { 'Content-Type': 'application/json' },
      2000,
      { allowHttp: true, allowPrivateTargets: true },
    );
    expect(result).toMatchObject({ ok: true, statusCode: 200, error: null });
    expect(result.body).toHaveLength(1024);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(received[0]?.headers.host).toBe(`rebind.test:${port}`);
    expect(received[0]?.body).toBe('{"ok":true}');
  });

  it('never connects when the first answer is private and private targets are not allowed', async () => {
    const sender = new WebhookSender(() => Promise.resolve([{ address: '127.0.0.1', family: 4 }]));
    const result = await sender.send(`http://rebind.test:${port}/hook`, '{}', {}, 2000, { allowHttp: true, allowPrivateTargets: false });
    expect(result).toEqual({ ok: false, statusCode: null, body: null, error: BLOCKED_TARGET_MESSAGE });
    expect(received).toHaveLength(0);
  });

  it('reports non-2xx answers and network errors as failures', async () => {
    const sender = new WebhookSender(() => Promise.resolve([{ address: '127.0.0.1', family: 4 }]));
    const policy = { allowHttp: true, allowPrivateTargets: true };
    expect(await sender.send(`http://local.test:${port}/fail`, '{}', {}, 2000, policy)).toMatchObject({ ok: false, statusCode: 500 });
    const refused = await sender.send('http://local.test:1/hook', '{}', {}, 2000, policy);
    expect(refused.ok).toBe(false);
    expect(refused.error).toBeTruthy();
  });
});
