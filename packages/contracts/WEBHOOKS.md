# Homing webhooks

Homing Cloud sends an HTTP `POST` with a JSON body to each enabled endpoint subscribed to an event. Endpoints are managed with the `/webhooks` operations in `openapi/public.yaml`, which also holds the payload schemas under `webhooks:` and `components.schemas.*WebhookEvent`.

## Event types

| Type | When | `data` |
| --- | --- | --- |
| `message.sent` | The phone handed the message to the carrier | `{ message: Message }` |
| `message.delivered` | The carrier confirmed delivery to the handset | `{ message: Message }` |
| `message.failed` | Sending or delivery failed, the lease ran out of attempts, or the pinned device was removed | `{ message: Message }` with `message.error` set |
| `message.cancelled` | The message was cancelled through `POST /messages/{id}/cancel` or the console | `{ message: Message }` |
| `message.expired` | A scheduled or pending message passed `validUntil` before a phone took it | `{ message: Message }` |
| `inbox.received` | A phone received an SMS, data SMS or MMS | `{ message: InboxMessage }` |
| `device.online` | A device sent a heartbeat after being offline | `{ device: { id, name, status, lastSeenAt } }`, `status` is `online` |
| `device.offline` | A device missed its heartbeats | `{ device: { id, name, status, lastSeenAt } }`, `status` is `offline` |
| `opt_out.received` | A received SMS matched an opt-out keyword (default `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`) | `{ phoneNumber, keyword, inboxMessageId, deviceId, receivedAt }` |
| `webhook.test` | Sent only by `POST /webhooks/{id}/test` | `{ endpointId, message }` |

An `opt_out.received` event is sent in addition to the `inbox.received` event for the same message. Device events report presence only: a `degraded` device is still `online` here, and `GET /devices` shows why it is degraded.

## How events are produced

Each event is written to an outbox table in the same database transaction as the change it describes. If that transaction rolls back, no event exists; once it commits, the event survives a crash. A dispatcher claims outbox rows with `FOR UPDATE SKIP LOCKED` about once a second, creates one delivery per subscribed, enabled endpoint and queues it. Subscriptions are matched when the event is dispatched, usually well under a second after the change. `createdAt` in the envelope is the time of the change. A delivery whose queue job was lost is queued again after a minute, so delivery is at least once.

## Envelope

```json
{
  "id": "evt_V1StGXR8Z5jdHi6BmyT",
  "type": "message.delivered",
  "createdAt": "2026-11-12T10:15:30.000Z",
  "accountId": "acc_3x9LkQ2mN8pR4tV6yB0c",
  "data": { "message": { "id": "msg_...", "state": "delivered" } }
}
```

`id` is the same for every attempt and redelivery of an event. Use it to drop duplicates. Deliveries are not ordered: compare `message.updatedAt` or the state itself instead of relying on arrival order.

## Headers

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `User-Agent` | `HomingCloud-Webhooks/1.0` |
| `Homing-Event-Id` | The envelope `id` |
| `Homing-Event-Type` | The envelope `type` |
| `Homing-Signature` | `t=<unix seconds>,v1=<hex signature>` |

## Verifying the signature

Each endpoint has its own secret, `whsec_...`, returned when the endpoint is created and when the secret is rotated.

1. Split `Homing-Signature` on `,` and read `t` and every `v1` value. More than one `v1` may appear in the future during secret rotation; accept the request if any of them matches.
2. Build the signed payload: the value of `t`, a literal `.`, then the raw request body bytes exactly as received. Do not parse and re-serialize the JSON first.
3. Compute `HMAC-SHA256(secret, signedPayload)` as lowercase hex. The full secret string, including the `whsec_` prefix, is the key.
4. Compare with a constant-time comparison.
5. Reject the request if `t` is more than 300 seconds away from your clock. This blocks replays of captured requests.

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHomingSignature(rawBody: string, header: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const parts = header.split(',').map((part) => part.split('=', 2) as [string, string]);
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex'));
  return parts
    .filter(([key]) => key === 'v1')
    .some(([, value]) => value.length === expected.length && timingSafeEqual(Buffer.from(value), expected));
}
```

Each attempt is signed again with a fresh `t`, so a retried delivery always passes the replay check.

## Retries

- A delivery succeeds when the endpoint answers any `2xx` within 10 seconds. Redirects are not followed.
- Any other status, a timeout or a network error is a failed attempt.
- Up to 8 attempts in total with exponential backoff starting at 60 seconds: about 1, 2, 4, 8, 16, 32 and 64 minutes after the previous attempt, about 2 hours in all.
- The delivery log (`GET /webhooks/{id}/deliveries`) keeps every delivery with its status (`pending`, `retrying`, `succeeded`, `failed`), attempt count, last status code, the first 1 KiB of the last response body and the last network error.
- `POST /webhooks/{id}/deliveries/{deliveryId}/redeliver` sends the original event again with a fresh attempt budget.
- Disabling an endpoint stops new deliveries. Deliveries already queued are skipped.

## Good practice

- Answer `2xx` quickly and do the work in the background.
- Treat the webhook as a signal; call `GET /messages/{id}` or `GET /inbox/{id}` when you need the latest state.
- Only `https://` URLs are accepted in production.

## Target checks

Before each attempt the host is resolved once. If any address is loopback, private (RFC 1918, carrier-grade NAT), link-local (including cloud metadata at `169.254.169.254`), unique-local or site-local IPv6, multicast, reserved or documentation space, IPv4-mapped or IPv4-compatible IPv6, NAT64, 6to4 or Teredo, the attempt fails with `Webhook target resolves to a private or reserved address` and nothing is sent. Otherwise the connection is made to the first resolved address, with the original host name kept for the `Host` header and TLS, so a DNS answer that changes between the check and the connection cannot redirect the request. Redirects are never followed. `WEBHOOK_ALLOW_PRIVATE_TARGETS` turns the range check off for local development only.
