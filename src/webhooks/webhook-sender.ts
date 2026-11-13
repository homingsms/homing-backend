import { Inject, Injectable } from '@nestjs/common';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { type ClientRequest, type IncomingMessage, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { RESPONSE_BODY_LIMIT } from './domain/event-types';
import { type DeliveryTarget, type DnsResolver, resolveDeliveryTarget, type UrlPolicy } from './domain/url-policy';

export const WEBHOOK_DNS_RESOLVER = Symbol('WEBHOOK_DNS_RESOLVER');

export interface SendResult {
  ok: boolean;
  statusCode: number | null;
  body: string | null;
  error: string | null;
}

function failure(error: unknown): SendResult {
  return { ok: false, statusCode: null, body: null, error: error instanceof Error ? error.message : String(error) };
}

export function pinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return (
    _hostname: string,
    options: LookupOptions,
    callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ) => {
    if (options.all) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  };
}

function readLimited(response: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = () => {
      resolve(Buffer.concat(chunks).subarray(0, limit).toString('utf8'));
    };
    response.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      size += chunk.byteLength;
      if (size >= limit) {
        response.destroy();
        finish();
      }
    });
    response.on('end', finish);
    response.on('error', finish);
    response.on('close', finish);
  });
}

@Injectable()
export class WebhookSender {
  constructor(@Inject(WEBHOOK_DNS_RESOLVER) private readonly resolver: DnsResolver) {}

  async send(
    url: string,
    body: string,
    headers: Record<string, string>,
    timeoutMs: number,
    policy: UrlPolicy,
  ): Promise<SendResult> {
    let target: DeliveryTarget;
    try {
      target = await resolveDeliveryTarget(url, policy, this.resolver);
    } catch (error) {
      return failure(error);
    }
    return this.post(target, body, headers, timeoutMs);
  }

  private post(target: DeliveryTarget, body: string, headers: Record<string, string>, timeoutMs: number): Promise<SendResult> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (result: SendResult) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      };
      const secure = target.url.protocol === 'https:';
      const options = {
        method: 'POST',
        hostname: target.hostname,
        port: target.url.port || (secure ? 443 : 80),
        path: `${target.url.pathname}${target.url.search}`,
        headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)), Host: target.url.host },
        lookup: pinnedLookup(target.address, target.family),
        agent: false as const,
        ...(secure && isIP(target.hostname) === 0 ? { servername: target.hostname } : {}),
      };
      const request: ClientRequest = (secure ? httpsRequest : httpRequest)(options, (response) => {
        void readLimited(response, RESPONSE_BODY_LIMIT).then((text) => {
          const statusCode = response.statusCode ?? null;
          done({ ok: statusCode !== null && statusCode >= 200 && statusCode < 300, statusCode, body: text, error: null });
        });
      });
      const timer = setTimeout(() => {
        request.destroy();
        done({ ok: false, statusCode: null, body: null, error: `Timed out after ${timeoutMs} ms` });
      }, timeoutMs);
      request.on('error', (error) => done(failure(error)));
      request.end(body);
    });
  }
}
