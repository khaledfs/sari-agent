# Architecture rules (non-negotiable)

Migrated from `docs/WORKING_INSTRUCTIONS.md` §1–3, §7 (see git history of that file for provenance).

## Product goals
- **MVP-first:** ship small, working slices; avoid premature abstraction and heavy UI churn.
- **Mobile-first:** layouts and touch targets work on narrow screens first.
- **B2B-style flows:** auth, catalog, cart, orders — keep flows clear and auditable.

## Stack (do not casually replace)
- **Next.js App Router** + **TypeScript** · **MongoDB** + **Mongoose** · **next-intl** (`en`/`he`/`ar`).
- **Next.js note:** this repo may follow conventions that differ from older training/docs. Before changing routing, cookies, or server/client boundaries, read the relevant guide under `node_modules/next/dist/docs/` and respect deprecations (see `AGENTS.md`).

## Service layer
- **All business logic and database access** belong in **`src/services/*.ts`** (or shared validators used by services).
- **API route handlers stay thin:** parse input → call service → return JSON. No orchestration-heavy logic in routes.

## Data access boundary
- Frontend must NEVER access MongoDB directly. All data goes through API routes → services.

## Data rules already committed to
- **Cart persistence:** MongoDB, per authenticated user — **never `localStorage` for cart state.**
- **Orders:** store **line-item snapshots** at order time (names/prices/quantities); never rely only on live product documents for history.
- **Order creation must be atomic:** create order + clear cart together; if any step fails, no partial state may remain.

## Client state
- **Do not add** Redux, Zustand, or similar global client-state libraries unless explicitly agreed.
- Prefer server APIs + local component state + `fetch`.

## Realtime events (SSE)
- Publish realtime events **only from the service layer, after the write succeeded** (after the transaction commits) — never from a route handler, never before commit. Use `publishRealtimeEvent()` from `src/services/event-bus.service.ts`.
- Channel names are derived server-side from the session role — **never accept a channel name from the client**. Customers: own `user:<id>` channel + `catalog`. Admin: `admin` + `catalog`.
- The shared `catalog` channel carries ids only — never prices, identities, or financial data; clients refetch through their own authorized endpoints.
- The bus is in-process: deployment must stay **single-instance (fork mode)** and the reverse proxy must not buffer `/api/events` (see `.claude/context/deployment.md`).

## UI and UX guardrails
- Minimal MVP styling is fine; prioritize clarity and accessibility basics (`aria-*` where it helps).
- **Dashboard protection:** `src/app/[locale]/dashboard/layout.tsx` gates child routes so logged-out users never see a flash of protected pages before redirect.
- **SessionBootstrap** handles happy-path redirects (e.g. logged-in user away from login/home); do not duplicate dashboard access control in multiple places.
