# Deploy playbook

Repeatable deploy steps for the production server. Full operator guide: `docs/DEPLOYMENT.md`.

1. `npm ci`
2. Ensure `.env.local` (or process env) carries the **required** variables: `MONGODB_URI`, `JWT_SECRET`, `OPENAI_API_KEY` (see DEPLOYMENT §2 for the full table).
3. `npm run build` (Turbopack production build; needs network for Google Fonts).
4. Start **single-instance**: `pm2 start npm --name sari -i 1 -- start` (`-i 1` = fork mode — NEVER cluster; the in-process event bus breaks otherwise).
5. Apply the nginx no-buffering blocks for `/api/events` and `/api/assistant/message` (DEPLOYMENT §1.2) and reload nginx.
6. Verify:
   - `npm run smoke` against the live URL (with `ADMIN_EMAIL`/`ADMIN_PASSWORD` for full coverage).
   - `curl -N https://<host>/api/events` streams `: connected` through the proxy (proves buffering is off).
7. Migrations/backfills only after product-owner approval — always `--dry` (default) first, then `--apply`.

## If the app half-breaks after a pull (stale build cache)
Symptoms: a route that exists in code 404s, or weird runtime errors (`TypeError: i is not a function`, `/500` static-file failures):
```bash
pm2 stop sari
rm -rf .next node_modules
npm ci && npm run build
pm2 restart sari
```
