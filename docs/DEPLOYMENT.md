# SARI — Deployment guide

Everything an operator needs to run this app in production, in one place.
Last updated: 2026-07-16 (after the 8-issue work order — see `PROGRESS.md` §2T–§2AA).

---

## 1. Realtime layer — REQUIRED operational constraints

**Technology: Server-Sent Events (`GET /api/events`) over an in-process event bus.**
Rationale: one-way server→client is sufficient (the assistant is request/response HTTP; no
human-to-human chat), SSE is native to Next.js route handlers (zero dependencies, **no paid
provider**), the app runs as a single Node process so a module-level singleton bus is correct
pub/sub (no Redis), auth reuses the session cookie, and the browser's `EventSource`
reconnects on its own.

### 1.1 Single instance ONLY (fork mode)
The event bus is in-process. With pm2 `cluster` mode / multiple instances, events published
on one worker never reach clients connected to another — realtime silently breaks.

```
pm2 start npm --name sari -i 1 -- start     # -i 1 = fork mode, never cluster
```

If the app ever scales out, the bus must move to MongoDB change streams or an external
pub/sub first.

### 1.2 Reverse proxy MUST NOT buffer the events route
nginx buffers responses by default and will break SSE. The route already sends
`X-Accel-Buffering: no`; additionally apply exactly this to the events location:

```nginx
location /api/events {
    proxy_pass http://127.0.0.1:3000;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
}

# Task C (2026-07-17): the assistant's streamed answers need the same treatment.
location /api/assistant/message {
    proxy_pass http://127.0.0.1:3000;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
    proxy_http_version 1.1;
}
```

---

## 2. Environment variables

| Variable | Required? | Notes |
|---|---|---|
| `MONGODB_URI` | **Required** | Atlas connection string (`sari` DB). App fails fast without it. |
| `JWT_SECRET` | **Required** | ≥32 chars — validated at module load, app fails fast otherwise. |
| `OPENAI_API_KEY` | **Required** for the assistant | All assistant paths call OpenAI. |
| `OPENAI_AGENT_MODEL` | Optional (default `gpt-5-mini`) | The tool-calling agent (Issue 6). |
| `OPENAI_PARSER_MODEL` / `OPENAI_ROUTER_MODEL` / `OPENAI_ADVISOR_MODEL` | Optional (default `gpt-5-mini`) | Legacy pipeline behind `/api/assistant/cart-command` only. |
| `OPENAI_MEMORY_MODEL` | Optional (default `gpt-4o-mini`) | Per-customer memory updates. |
| `OPENAI_AGENT_REASONING` | Optional (default `minimal`) | Agent reasoning effort (minimal/low/medium/high); raise for deeper reasoning at higher latency. |
| `REVALIDATE_SECRET` | Optional | Lets `scripts/sync-products.js` bust the catalog cache via `POST /api/products/revalidate`. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Optional (tooling only) | Enable the admin sections of `npm run smoke`. |
| `SMOKE_AI` | Optional (tooling only) | `1` enables the OpenAI-dependent smoke checks (cost). |
| `BASE_URL` / `SMOKE_CUSTOMER_PHONE` / `SMOKE_CUSTOMER_PASSWORD` | Optional (tooling only) | Smoke-runner overrides. |
| `PAYMENTS_ENABLED` | Optional (default **false**) | Must be exactly `true` to show the card option and open the card endpoints. Agent payment always works. **Do NOT enable in production until a real payment adapter is wired** — the dev mock refuses to run there (loud crash by design). |
| `MOCK_WEBHOOK_SECRET` | Optional (dev only) | HMAC secret for the mock provider's webhook signature (default dev value). Irrelevant once a real adapter exists. |

**Payment webhook:** the provider must POST to `https://<public-host>/api/payments/webhook`.
⚠ The current sslip.io hostname is derived from the server IP — if the server moves, the webhook URL
changes and payment confirmations silently stop. Use a stable domain (or make updating the provider
dashboard part of the migration runbook). Real-provider connection checklist: DEV_NOTES §32.

---

## 3. Database migrations & backfills (dry-run first, ALWAYS)

Both scripts follow the project conventions: standalone Node, read `.env.local`, `--dry`
support, idempotent, never delete. **Neither has been run for real yet — both dry-runs are
reported and the real writes await product-owner approval.**

### 3.1 `scripts/migrate-account-status.js` (Issue 3)
Backfills `user.accountStatus` — legacy `isActive=false` → `"restricted"`, everyone else →
`"active"`. The app derives the identical state at read time, so this is a consistency
backfill, not a behavior change.

```
node scripts/migrate-account-status.js --dry   # report only
node scripts/migrate-account-status.js         # real write (after approval)
```
Dry-run 2026-07-16: 18 users → 18 "active", 0 legacy-disabled.

### 3.2 `scripts/backfill-ledger.js` (Issue 8)
Posts `order_charge` ledger entries for pre-ledger orders (stamped with the order's original
`createdAt`) plus compensating reversals for cancelled ones. Keyed by unique
`idempotencyKey`, so re-running never duplicates.

```
node scripts/backfill-ledger.js --dry          # report only
node scripts/backfill-ledger.js                # real write (after approval)
```
Dry-run 2026-07-16: 241 order_charge + 1 order_reversal would post.
Until this runs, customer ledgers only show activity from 2026-07-16 onward.

---

## 4. Deployment steps for this server

1. `npm ci`
2. Ensure `.env.local` (or process env) carries the **Required** variables above.
3. `npm run build` (Turbopack production build; may need network for Google Fonts).
4. Start single-instance: `pm2 start npm --name sari -i 1 -- start` (or `npm run start`).
5. Apply the nginx SSE snippet (§1.2) and reload nginx.
6. Verify: `npm run smoke` against the live URL (with `ADMIN_EMAIL`/`ADMIN_PASSWORD` for full
   coverage); check `GET /api/events` streams `: connected` through the proxy (curl -N).
7. After product-owner approval only: run the two backfills (§3), `--dry` first.

### Manual production configuration checklist
- **Rotate the seeded admin password** (`admin@sari.com` / `Admin1234` is a repo default on a
  real cluster) via `/{locale}/admin/dashboard/settings` — still outstanding.
- nginx SSE location block (§1.2).
- pm2 fork mode (§1.1).

---

## 5. Known limitations

- **No SSE event replay:** events emitted while a client is disconnected are lost; clients
  refetch authoritative state on reconnect (built into the realtime provider). Fine for this
  UI, not a message queue.
- **Single-instance constraint** (§1.1) until the bus moves to change streams/external pub/sub.
- **Bulk product sync** (`scripts/sync-products.js`) does not emit per-product realtime
  events; the catalog cache invalidation covers correctness on the next request.
- **Web search for the assistant is stubbed** (per-call cost unapproved); the assistant says
  so honestly when a question needs live web data.
- **Mock invoices page** (`/dashboard/invoices`) still shows placeholder data — no invoice
  model exists (pending product decision; the ledger page itself is fully real).
- `npm run build` needs outbound network for Google Fonts (documented environmental caveat).
