# Deployment context

Operator's guide: **`docs/DEPLOYMENT.md`** (tracked) — this is the summary of the constraints that shape code decisions.

- **Topology:** single VPS, Node app under **PM2 in fork mode** behind **nginx**.
- **Single instance ONLY** (`pm2 start npm --name sari -i 1 -- start`). The realtime event bus is in-process; cluster mode / multiple instances silently break SSE delivery. Scaling out requires moving the bus to change streams or external pub/sub first.
- **nginx must not buffer streaming routes:** `proxy_buffering off` + `proxy_cache off` for **`/api/events`** (SSE, 3600s read timeout) and **`/api/assistant/message`** (streamed answers, 300s). Exact snippets: DEPLOYMENT §1.2. Without them streaming silently degrades to buffered-at-once in production.
- **Required env:** `MONGODB_URI`, `JWT_SECRET` (≥32 chars, validated at module load), `OPENAI_API_KEY` (assistant). Optional: model overrides (`OPENAI_AGENT_MODEL` etc.), `OPENAI_AGENT_REASONING`, `REVALIDATE_SECRET`, `PAYMENTS_ENABLED` (default false; do NOT enable in production until a real payment adapter is wired — the dev mock refuses to run there), smoke-tooling vars. Full table: DEPLOYMENT §2.
- **Payment webhook** must reach `https://<public-host>/api/payments/webhook`; the current hostname is IP-derived (sslip.io) — if the server moves, the webhook URL changes and confirmations silently stop. Prefer a stable domain before going live.
- **Deploy routine:** see `.claude/commands/deploy.md`.
- **Known limitations:** no SSE event replay (clients refetch on reconnect); bulk product sync emits no per-product events (cache invalidation covers it); `npm run build` needs network for Google Fonts.
