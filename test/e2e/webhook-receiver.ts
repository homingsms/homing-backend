import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReceivedWebhook {
  headers: IncomingHttpHeaders;
  body: string;
  type: string;
}

export class WebhookReceiver {
  readonly received: ReceivedWebhook[] = [];
  private server: Server | null = null;
  private failuresLeft = 0;

  async start(): Promise<string> {
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        if (this.failuresLeft > 0) {
          this.failuresLeft -= 1;
          response.writeHead(500).end('try again');
          return;
        }
        const body = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(body) as { type: string };
        this.received.push({ headers: request.headers, body, type: parsed.type });
        response.writeHead(200).end('ok');
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/hooks`;
  }

  failNext(count: number): void {
    this.failuresLeft = count;
  }

  ofType(type: string): ReceivedWebhook[] {
    return this.received.filter((item) => item.type === type);
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }
}

export async function waitFor<T>(probe: () => T | undefined | Promise<T | undefined>, timeoutMs = 10000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Condition not met within ${timeoutMs} ms`);
}
