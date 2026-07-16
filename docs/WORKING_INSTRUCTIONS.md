# Working instructions (project agreements)

This document records **how we build and extend this codebase**, so new sessions (human or AI) stay consistent with prior decisions. It complements **`DEV_NOTES.md`**, which is the **implementation snapshot** (what exists, where files live, how to smoke-test).

---

## 1. Product goals

- **MVP-first:** ship small, working slices; avoid premature abstraction and heavy UI churn.
- **Mobile-first:** layouts and touch targets should work on narrow screens first.
- **B2B-style flows:** auth, catalog, cart, orders — keep flows clear and auditable.

---

## 2. Stack (do not casually replace)

- **Next.js App Router** + **TypeScript**
- **MongoDB** + **Mongoose**
- **next-intl** for **`en` / `he` / `ar`**
- **RTL** for Hebrew and Arabic (`dir` + logical CSS; avoid hard-coded “left/right” where start/end is better)

**Next.js note:** This repo may follow **Next.js conventions that differ from older training/docs**. Before changing routing, cookies, or server/client boundaries, read the relevant guide under `node_modules/next/dist/docs/` and respect deprecations (see `AGENTS.md`).

---

## 3. Architecture rules (non‑negotiable)

### 3.1 Service layer

- **All business logic and database access** belong in **`src/services/*.ts`** (or shared validators used by services).
- **API route handlers stay thin:** parse input → call service → return JSON. No orchestration-heavy logic in routes.

### 3.2 Auth and identity

- **Session source of truth:** **`authToken` httpOnly cookie** + JWT (see login route and `src/lib/jwt.ts`).
- **Identify the user on the server** via **`src/lib/auth-user.ts`** → **`getAuthenticatedUserId()`** in API routes.
- **Never trust `userId` (or role) from client input** for cart, orders, or any protected resource. Do not accept user id from query/body for authorization.

### 3.3 Data rules we have already committed to

- **Cart persistence:** MongoDB, **per authenticated user** — **do not use `localStorage` for cart state.**
- **Orders:** store **line-item snapshots** at order time (names/prices/quantities); do not rely only on live product documents for history.

Orders integrity
- Order creation must be atomic:
  - create order
  - clear cart
- If any step fails, system must not leave partial state

### 3.4 Client state

- **Do not add** Redux, Zustand, or similar **global client state libraries** unless explicitly agreed.
- Prefer server APIs + local component state + `fetch`.

### 3.5 Data access boundary

- Frontend must NEVER access MongoDB directly
- All data must go through API routes → services

### 3.6 Realtime events (SSE)

- Realtime events are published **only from the service layer, after the write succeeded**
  (after the transaction commits) — never from a route handler, never before commit.
  Use `publishRealtimeEvent()` from `src/services/event-bus.service.ts`.
- Channel names are derived server-side from the session role — **never accept a channel
  name from the client**. Customers: own `user:<id>` channel + `catalog`. Admin: `admin` +
  `catalog`.
- The shared `catalog` channel carries ids only — never prices, identities, or financial
  data; clients refetch through their own authorized endpoints.
- The bus is in-process: deployment must stay **single-instance (fork mode)**, and the
  reverse proxy must disable buffering for `/api/events` (see DEV_NOTES §15).

### 3.7 Account restriction (ordering hold)

- `user.accountStatus` ("active" | "restricted") is the **single source of truth** for
  ordering permission. Legacy `user.isActive` is read-only compatibility (see DEV_NOTES §16)
  — never enforce it anywhere new, and never block login for a restricted customer.
- Every cart-mutating or order-creating service function MUST call
  `requireOrderingEnabled(userId)` (account-status.service) which reads the CURRENT DB
  state — never trust JWT claims for this.
- Routes map the guard error via `mapAccountRestrictedError()` →
  `403 { code: "ACCOUNT_RESTRICTED" }`. Frontend disabling is UX only, never the enforcement.
- Restricted customers keep ALL read access (orders, ledger, catalog, receipts, realtime).
---

## 4. Internationalization (i18n)

- Any user-visible string added in UI should get keys in **all three** files:
  - `src/i18n/messages/en.json`
  - `src/i18n/messages/he.json`
  - `src/i18n/messages/ar.json`
- Keep key namespaces consistent (`cart.*`, `orders.*`, `products.*`, etc.).
- **RTL:** verify Hebrew/Arabic layouts still read naturally (mirroring, alignment, icons).

---

## 5. API response shape

- Prefer consistent JSON:
  - **Success:** `{ success: true, data, ... }`
  - **Failure:** `{ success: false, message }` with an appropriate HTTP status (`401` unauthenticated, `404` not found, `400` validation/business rule, etc.)
- **Structured errors** should originate from **services** (throw `Error("...")` with a clear message) and be mapped in routes without duplicating business rules.
### API consistency

- All endpoints must return:
  { success: boolean, data?: any, message?: string }
---

## 6. Auth flows (do not regress without explicit intent)

These flows are considered **stable contracts**:

- register → verify → login → session → logout

Changes that touch them must be **careful, minimal, and tested**. Do not “refactor auth” as a side effect of feature work.

---

## 7. UI and UX guardrails

- **Minimal MVP styling** is fine; prioritize clarity and accessibility basics (`aria-*` where it helps).
- **Dashboard protection:** `src/app/[locale]/dashboard/layout.tsx` gates child routes so **logged-out users do not see a flash of protected pages** before redirect.
- **SessionBootstrap** handles **happy-path redirects** (e.g. logged-in user away from login/home); avoid duplicating dashboard access control in multiple places.

---

## 8. Workflow for every meaningful change

1. **Read** nearby existing code and match patterns (imports, error style, naming).
2. **Implement** the smallest change that satisfies the request.
3. **Update `docs/DEV_NOTES.md`** when the feature is non-trivial (new model, new API surface, new flows, important caveats).
4. **Update this file** if we change **rules** or **process** (not for every tiny tweak).
5. **Verify:**
   - `npm run lint`
   - `npm run build` (includes TypeScript in this project)
   - If `tsc` alone errors inside `.next` generated types, try a clean `.next` / full build (see `DEV_NOTES.md`).

---

## 9. What to update when (summary)

| Change | Update `DEV_NOTES.md`? | Update `WORKING_INSTRUCTIONS.md`? |
|--------|-------------------------|-------------------------------------|
| New model / API / major flow | Yes | Only if rules change |
| Bugfix, small UI tweak | Optional note if behavior mattered | No |
| New global rule (“never X”, “always Y”) | Short pointer | Yes |

---

## 10. Session handoff

When starting a **new chat**, paste or point to:

1. This file (`docs/WORKING_INSTRUCTIONS.md`)
2. `docs/DEV_NOTES.md` (current snapshot + resume checklist)

That is usually enough to continue without re‑deriving architecture from scratch.
