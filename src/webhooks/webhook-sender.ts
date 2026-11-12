import { Injectable } from '@nestjs/common';
import { RESPONSE_BODY_LIMIT } from './domain/event-types';
import { assertDeliverableTarget, type UrlPolicy } from './domain/url-policy';

export interface SendResult {
  ok: boolean;
  statusCode: number | null;
  body: string | null;
  error: string | null;
}

async function readLimited(response: Response, limit: number): Promise<string> {
  if (!response.body) {
    return '';
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const result = await reader.read();
    const chunk: unknown = result.value;
    if (result.done || !(chunk instanceof Uint8Array)) {
      break;
    }
    chunks.push(chunk);
    size += chunk.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).subarray(0, limit).toString('utf8');
}

@Injectable()
export class WebhookSender {
  async send(
    url: string,
    body: string,
    headers: Record<string, string>,
    timeoutMs: number,
    policy: UrlPolicy,
  ): Promise<SendResult> {
    try {
      await assertDeliverableTarget(url, policy);
    } catch (error) {
      return { ok: false, statusCode: null, body: null, error: error instanceof Error ? error.message : String(error) };
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        body,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await readLimited(response, RESPONSE_BODY_LIMIT);
      return {
        ok: response.status >= 200 && response.status < 300,
        statusCode: response.status,
        body: text,
        error: null,
      };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      return {
        ok: false,
        statusCode: null,
        body: null,
        error: timedOut ? `Timed out after ${timeoutMs} ms` : error instanceof Error ? error.message : String(error),
      };
    }
  }
}
