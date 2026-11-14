# Homing Cloud

Homing Cloud is the server behind Homing. Customer apps call its public API to send SMS, data SMS and MMS; paired Android phones pull those messages, send them through their SIMs and report back; received messages and delivery updates go out as signed webhooks. The web console uses the same public API.

This repository owns:

- the NestJS 11 API in `src/`, served under `/api/v1` on port 7010
- the shared API contracts in `packages/contracts/` (`@homing/contracts`): the public OpenAPI spec, the phone protocol spec, webhook documentation and generated TypeScript types. Start with `packages/contracts/CONTRACTS.md`.

The web console (`frontend`) and the Android app (`android`) live in their own repositories and consume these contracts.

## Stack

NestJS 11 on Express, PostgreSQL 16 with Drizzle ORM and postgres-js, Redis with BullMQ for webhook delivery, firebase-admin for phone wake-ups, class-validator for request bodies, Zod for configuration, Jest and supertest for tests.

## Layout

| Path | What it holds |
| --- | --- |
| `src/accounts` | Sign up, sign in, sessions, account switching, terms acceptance, account settings and deletion |
| `src/team` | Members, roles (`owner`, `admin`, `member`) and invite links |
| `src/api-keys` | Scoped `hk_live_` keys, stored as peppered SHA-256 hashes |
| `src/devices` | Pairing codes, device tokens, heartbeats, presence, status and its reasons, remote settings, daily usage |
| `src/messages` | Sending, idempotency, routing, state machine, timeline, cancel |
| `src/leases` | Phone pull with row leases, state reports, lease expiry |
| `src/inbox` | Received SMS, data SMS and MMS, opt-out detection |
| `src/webhooks` | Endpoints, transactional outbox and its dispatcher, signing, BullMQ delivery worker with pinned DNS, delivery log |
| `src/push` | FCM wake-ups, disabled when no Firebase credentials are set |
| `src/usage` | Dashboard counters |
| `src/maintenance` | Periodic sweep: scheduled messages, lease and validity expiry, offline devices, routing of waiting messages, purging deleted accounts |
| `src/health`, `src/docs` | Health check and the read-only public spec |
| `src/database/schema` | Drizzle tables; migrations are generated into `drizzle/` |
| `test/e2e` | End-to-end tests against real PostgreSQL and Redis |

## Setup

Requirements: Node 24 or newer, pnpm 11, Docker (or your own PostgreSQL 16 and Redis 7).

```bash
pnpm install
docker compose up -d
cp .env.example .env
```

Edit `.env`: set `SECRET_PEPPER` to at least 32 random characters and `ENCRYPTION_KEY` to the output of `openssl rand -hex 32`. Then create the schema and start the server:

```bash
pnpm db:migrate
pnpm dev
```

The API listens on http://localhost:7010/api/v1. `GET /api/v1/health` reports database and Redis status, and `GET /api/v1/docs` returns the public OpenAPI spec (`/api/v1/docs/openapi.json` for JSON).

`docker compose` runs PostgreSQL on port 54329 (databases `homing_dev` and `homing_test`, user and password `homing`) and Redis on port 63799, so it does not clash with services already running on the default ports. `docker compose down` stops them; add `-v` to drop the data.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start with reload |
| `pnpm build` | Compile to `dist/` |
| `pnpm start` | Run the compiled server |
| `pnpm typecheck` | TypeScript check of source and tests |
| `pnpm lint` | ESLint with type-aware rules |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | End-to-end tests; needs PostgreSQL and Redis |
| `pnpm db:generate` | Generate a migration after changing `src/database/schema` |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |
| `pnpm contracts:lint` | Lint both OpenAPI specs with Redocly |
| `pnpm contracts:generate` | Regenerate the contract types after editing a spec |

End-to-end tests default to the compose services (`postgres://homing:homing@localhost:54329/homing_test` and `redis://localhost:63799/1`). Point them elsewhere with `DATABASE_URL` and `REDIS_URL`. They apply migrations, truncate the test database and remove their queue keys when they finish, so never point them at a database or Redis prefix you care about.

## Checks before pushing

```bash
pnpm contracts:lint
pnpm --filter @homing/contracts typecheck
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

CI in `.github/workflows/backend.yml` runs the same steps with PostgreSQL and Redis service containers, checks that the generated contract types match the specs, and builds the Docker image.

## Changing the API

1. Edit `packages/contracts/openapi/public.yaml` or `device.yaml` first.
2. Run `pnpm contracts:lint` and `pnpm contracts:generate`.
3. Change the server. The e2e tests validate real responses against the spec schemas, and a unit test checks that server enums match the spec.
4. Update `CONTRACTS.md` or `WEBHOOKS.md` when behaviour changes.

## Configuration

Every setting is read through `ConfigService` and validated at startup; see `src/config/env.schema.ts` and `.env.example`. The important ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL`, `DATABASE_POOL_MAX` | PostgreSQL connection, pool of 10 by default |
| `REDIS_URL`, `QUEUE_PREFIX` | Redis for BullMQ and the key prefix |
| `CORS_ORIGINS` | Comma separated origins allowed to call the API with cookies, such as the console URL. When unset, development allows `http://localhost:7011` (the local console) and other environments allow none. Set it explicitly in production |
| `PUBLIC_API_URL` | Base URL encoded into pairing QR codes |
| `CONSOLE_URL`, `INVITE_TTL_DAYS` | Console base URL used to build invite links (`<CONSOLE_URL>/invite/<token>`), and how long an invite works (7 days) |
| `SECRET_PEPPER` | Pepper for hashing API keys, device tokens, pairing codes and sessions. Changing it invalidates all of them |
| `ENCRYPTION_KEY` | AES-256-GCM key for webhook signing secrets at rest |
| `COOKIE_SECURE` | Defaults to true in production |
| `THROTTLE_LIMIT`, `AUTH_THROTTLE_LIMIT` | Requests per `THROTTLE_TTL_SECONDS` per account, device or IP; the stricter limit applies to sign up, sign in, pairing and invite links. Counters live in Redis under `<QUEUE_PREFIX>:throttle:`, so limits hold across replicas |
| `LEASE_SECONDS`, `MAX_LEASE_ATTEMPTS` | How long a pulled message waits for `queued`, and how many leases before it fails |
| `OFFLINE_AFTER_SECONDS`, `MAINTENANCE_INTERVAL_MS` | Presence timeout and sweep interval (0 disables the sweep) |
| `STALE_HEARTBEAT_SECONDS`, `LOW_BATTERY_PERCENT` | When a heartbeating device is reported `degraded` for a late heartbeat (two heartbeat intervals by default) or low battery (below 15% and not charging) |
| `WEBHOOK_*` | Worker switch, timeout, attempts, backoff, outbox poll interval and batch (`WEBHOOK_OUTBOX_INTERVAL_MS`, 0 stops the dispatcher), and whether plain HTTP or private network targets are allowed. Keep both off in production; the local `.env` turns them on for development |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Base64 of a Firebase service account JSON. Empty disables push and phones fall back to polling |
| `TRUST_PROXY` | Set to true behind a reverse proxy so rate limits see the client IP |

## Deployment

```bash
docker build -t homing-cloud .
docker run --rm --env-file .env homing-cloud node dist/database/migrate.js
docker run -d --env-file .env -p 7010:7010 homing-cloud
```

The image runs as the unprivileged `node` user and has a health check on `/api/v1/health`. Run the migration command once per release before starting the new version. The maintenance sweep uses a PostgreSQL advisory lock and the webhook outbox is claimed with `FOR UPDATE SKIP LOCKED`, so several replicas can run safely; rate limit counters are shared through Redis.

## Known limits

- Invites are not emailed. `POST /team/invites` returns the link once and the console shows it to copy.
- Webhook delivery is at least once. A delivery whose queue job was lost is queued again after a minute, so receivers should drop duplicates by event `id`.
- MMS attachments are stored in PostgreSQL, capped at 1 MiB per outgoing message.
