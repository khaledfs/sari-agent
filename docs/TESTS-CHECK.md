# SARI — Independent QA Audit (TESTS-CHECK)

**Auditor role:** independent QA — verify, don't improve. Read-only.
**Date executed:** 2026-07-17
**Commit under audit:** `0d40085` (branch `main`, clean tree at start)
**Server under test:** running dev server at `http://localhost:3000` (Next.js 16.2.1, Node fetch)
**DB:** Atlas `sari` (shared). Only the seeded demo customer `+972-52-3841176` and the default admin were touched. No production/real customer data, no seed/migration/backfill/sync scripts run.

Evidence standard: every PASS below carries the command + observed output. Anything not executed is marked **NOT TESTED**. No "should work".

---

# Executive Summary

**Overall status: healthy build, green type/compile/unit/smoke — with three real defects, all low/medium severity. No high-severity functional or security failure found.**

Static analysis (tsc, build) is clean; the full unit suite (328) and the integration smoke suite (70/71) pass live; security boundaries (customer↔admin, unauth, cross-customer isolation, agent scoping) all hold under direct probing.

The documentation is **largely accurate** — most `✅ Done` claims verified true against the running system — but three items do not match reality:

**High-risk issues:** none found.

**Medium-risk issues:**
- **M1 — Backfill/migration/seed scripts write by default; `--dry` is opt-in, not the default.** PROGRESS repeatedly calls these "dry-run only". In the code the safety is inverted: running `node scripts/migrate-account-status.js` (or `backfill-ledger.js`, `seed-agents.js`) with **no flag performs real Atlas writes**. The stated safety depends entirely on an operator remembering `--dry`. All three point at the real shared cluster. (Not triggered during this audit.)
- **M2 — Default admin password `Admin1234` is still live** on the real Atlas cluster (confirmed: login succeeded with it during the audit). Known + documented, still unrotated. Anyone reaching the host owns the admin console.

**Low-risk issues:**
- **L1 — Repo-level lint is red.** `npm run lint` exits 1: 6 `no-require-imports` errors in two dev-utility scripts (`scripts/cache-category-images.js`, `scripts/train-oriental-sweets-customer.js`). PROGRESS claims "eslint clean" — true only for `src/`, not the repo. Ships nothing, but the documented lint gate does not pass as written.
- **L2 — Smoke check "banner: imageUrl round-trips" fails as written** (1 of 71). Investigated: **the feature works** (direct curl round-trips imageUrl to the customer feed); the *test* is fragile — the customer feed caps at max-3-by-priority and the smoke image banner (priority 96) is ranked out by three higher-priority banners created earlier in the same test section. PROGRESS §2AD's "Smoke 57/57 incl. imageUrl round-trip" is no longer reproducible in the current data state.
- **L3 — Dev-only endpoints present in the build:** `/api/test`, `/api/products/seed`, `/api/products/import-from-site`. Seed/import are documented as returning 403 under `NODE_ENV=production` (not re-verified in prod mode here — see Untested). `/api/test` existence noted, not audited.

---

# Build Health

**PASS.** Production build completes.

```
$ npm run build     (next build, Turbopack)
BUILD_EXIT=0
ƒ Proxy (Middleware)          # next-intl middleware compiled in
○ (Static) / ƒ (Dynamic) route table emitted, no errors
```

Note: PROGRESS §1 warns the build "may fail only on an offline Google Fonts fetch". It did **not** fail here — build was clean end-to-end.

---

# Static Analysis

| Check | Command | Result |
|------|---------|--------|
| Type check | `npx tsc --noEmit` | **PASS** — `TSC_EXIT=0` |
| Lint (src only) | `npx eslint src` | **PASS** — exit 0 |
| Lint (repo, canonical) | `npm run lint` | **FAIL** — exit 1; 6 errors, 6 warnings (see L1) |
| Build | `npm run build` | **PASS** — exit 0 |

`npm run lint` failing files:
```
scripts/cache-category-images.js        2 × no-require-imports (error)
scripts/train-oriental-sweets-customer.js  4 × no-require-imports (error)
src/lib/admin-ledger.ts                 unused var (warning)
src/services/assistant-clarification.service.ts  unused var (warning)
✖ 12 problems (6 errors, 6 warnings)
```

---

# Unit Tests

**PASS — 328/328.** Matches PROGRESS's "328" claim exactly.

```
$ npm test   (vitest run)
Test Files  21 passed (21)
     Tests  328 passed (328)
TEST_EXIT=0
```

- Failing: 0
- Skipped: 0
- Flaky: none observed (single run; not stress-repeated — see Untested).

---

# Integration Tests

**70 PASS / 1 FAIL** via `scripts/smoke.mjs` against the live server (`ADMIN_EMAIL`/`ADMIN_PASSWORD` supplied). AI section skipped (env-gated, not run — see Untested).

```
$ ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/smoke.mjs
70 passed, 1 failed
SMOKE_EXIT=1
```

Verified passing groups (each an API + DB round trip): page/locale routing, seeded customer login+cart, admin products list/patch/restore, pricing engine (base=discount=restore), promotions (gift threshold + order gift line), banners (audience targeting, ctaHref guard, deactivation), overview (shape + revenue delta), admin order detail (items + status-history audit), SSE (401 + heartbeat), restricted customer (403 matrix + reads open + login open), receipt gating (403/401/404/200 matrix), ledger (integer agorot, order_charge, payment sign, cancel reversal, idempotency), agent scoping + messaging (14 checks).

**The one FAIL — `banner: imageUrl round-trips to the customer feed` — is a test artifact, not a defect** (see L2 and Bug B2 for the direct-curl proof that the feature works).

---

# Module Interaction Tests (seams)

All verified live; interactions only observable when modules combine.

| Seam | Evidence | Result |
|------|----------|--------|
| cart ↔ pricing | `pricing: cart total with no rules === base` (90=90); discount drops list price to 81 then restores to 90 | **PASS** |
| pricing ↔ order snapshot | order line carries `priceBreakdown{base:90,discount:10,final:81}` | **PASS** |
| cart ↔ promotions ↔ order | under-threshold hint → over-threshold ₪0 gift line → order stores gift line + `appliedPromotionIds` | **PASS** |
| order creation atomicity + inventory | sold-out (`stock<=0`) rejection lives in `cart.service` for every caller (Task E fix); order create in a Mongo txn (PROGRESS §2P) | **PASS** (rejection path exercised by unit tests; txn path not fault-injected — see Untested) |
| order ↔ ledger | new order posts `order_charge` = exact total (delta 9000 agorot); cancel posts compensating reversal; re-cancel idempotent (count=1) | **PASS** |
| customer isolation | customer B GET on customer A's receipt → **404** (no existence leak) | **PASS** |
| agent scope ↔ orders/customers/reports/ledger | agent sees exactly 1 assigned customer; foreign orders=0; report strangers=0; cross-scope customer → 404; admin-only surfaces → 403 FORBIDDEN_SCOPE | **PASS** |
| realtime (SSE) ↔ auth | unauth → 401; authed → `text/event-stream` + `: connected` frame | **PASS** |
| assistant ↔ ordering pipeline | **NOT TESTED** (SMOKE_AI gated — calls OpenAI). Covered indirectly: restricted-customer cart refusal path asserted by non-AI smoke + unit tests. |

---

# End-to-End Flows

| Flow | Evidence | Result |
|------|----------|--------|
| Customer login → cart read | login 200 + `authToken` cookie; `GET /api/cart` → `{success:true}` | **PASS** |
| Browse products (paginated) | `GET /api/admin/products?page=1` → 50 items, total 610 | **PASS** |
| Add to cart → price correctness | add 1 unit → cartTotal === base price | **PASS** |
| Checkout → order creation → snapshot | `POST /api/orders` → order with line-item breakdown | **PASS** |
| Order → ledger charge | balance grows by exact order total | **PASS** |
| Cancel → reversal | balance returns; original charge untouched | **PASS** |
| Admin: order list → detail drawer → status change → history audit | detail items match list total; 2 status changes → 2 audited history entries (actor=admin) | **PASS** |
| Admin ↔ customer messaging (via agent) | restricted customer can still message; agent replies; customer sees reply; admin reads full thread (6 msgs) | **PASS** |
| Receipt gating lifecycle | pending→403, cancelled→403, dispatched→200 snapshot | **PASS** |
| Locale routing | `NEXT_LOCALE=he` cookie → 307 → `/he`; `/en`,`/he`,`/ar` all 200 | **PASS** |
| AI-assisted ordering (full LLM turn) | **NOT TESTED** — requires `SMOKE_AI=1` (OpenAI cost/latency). Structural path only. |

---

# Security Validation

Direct probing with independent cookies (not via the app UI). All hold.

```
Customer token → admin endpoints (expect 401/403):
  GET /api/admin/orders      → 401
  GET /api/admin/customers   → 401
  GET /api/admin/overview    → 401
  POST /api/admin/agents     → 401

Unauthenticated protected reads (expect 401):
  GET /api/cart              → 401
  GET /api/orders            → 401
  GET /api/messages          → 401
  GET /api/account/ledger    → 401

Cross-account isolation:
  customer B GET /api/orders/<customer A order>/receipt → 404 (no leak)

Agent authorization (from smoke, live):
  cross-scope customer detail            → 404
  product edit / global discount create  → 403 FORBIDDEN_SCOPE
  scoped lists (customers/orders/reports) contain only the agent's book
```

| Control | Result |
|---------|--------|
| Customer isolation / tenant boundary | **PASS** |
| Cross-account access prevention | **PASS** (404, no existence leak) |
| Authorization on admin endpoints | **PASS** (401 for customer + unauth) |
| Agent scope (deny-by-default, 404 scope / 403 role) | **PASS** |
| Protected resources reject unauthenticated | **PASS** |
| **Default admin credential still valid** | **FAIL (M2)** — `admin@sari.com` / `Admin1234` logged in successfully against real Atlas |

Note (design fact, not a new finding): there is **no middleware auth gate** on `/admin` — every admin route enforces `requireAdmin()`/scope per-request (PROGRESS §4). Probing confirms the per-request guard is present on every endpoint tested; no unguarded admin endpoint was found.

---

# Documentation Verification

Every claim below was checked against the running system.

| PROGRESS claim | Verdict | Evidence |
|----------------|---------|----------|
| 610 products synced | **Verified** | admin list `total=610` |
| 328 unit tests | **Verified** | `Tests 328 passed` |
| Admin login works / default admin seeded | **Verified** | login 200 |
| Admin orders: list + status control + detail drawer + status-history audit (§2T) | **Verified** | smoke order-detail: 2 changes → 2 audited entries, total matches list |
| Realtime SSE + in-process bus (§2U) | **Verified** | 401 unauth + `: connected` authed frame |
| Restricted customers read-only, login open (§2V) | **Verified** | 403 cart/order, 200 reads, login 200 |
| Receipt gated until dispatch (§2W) | **Verified** | 403/401/404/200 matrix |
| Real ledger, integer agorot, computed balance, reversals (§2X) | **Verified** | exact deltas, sign, idempotency |
| Language switcher + middleware moved to `src/middleware.ts` (§2Y) | **Verified** | root middleware absent; `src/middleware.ts` present; 307 locale redirect; build shows Proxy(Middleware) |
| Pricing engine precedence/no-stack (§2I) | **Verified** | discount 10% → 81, restore → 90 |
| Promotions & gifts (§2J) | **Verified** | ₪0 gift line + order promotionId |
| Banners audience-targeted, ctaHref internal-guard (§2K) | **Verified** | bakery sees bakery not cafe; external ctaHref → 400 |
| Overview one-payload dashboard (§2L) | **Verified** | shape + revenue-delta consistency |
| Agent role, scope resolver, messaging (§2AF) | **Verified** | 14 smoke checks incl. 404 scope / 403 role |
| Task A/B/C/E commits present | **Verified** | git log shows all five WO-2 commits |
| **"Banner imageUrl round-trips; Smoke 57/57" (§2AD)** | **Partial / stale** | feature works (curl), but the smoke assertion **now fails** (max-3 priority cap) — claim not reproducible |
| **Backfill/migration/seed scripts "dry-run only" (§0, §2V, §2X, §2AF)** | **Failed (misleading)** | scripts **write by default**; `--dry` is opt-in (`const DRY = args.includes("--dry")`) |
| **"eslint clean" (repeated)** | **Partial** | true for `src/`; `npm run lint` (repo) exits 1 |
| Assistant tool-calling agent QA scenario (§2AA) | **NOT TESTED** | needs live OpenAI (SMOKE_AI) |
| Assistant eval 20–21/24 (§2AG) | **NOT TESTED** | `scripts/assistant-eval.mjs` calls OpenAI; not run |

---

# Data Hygiene

Every write performed during this audit, and its disposition. **All writes landed only on the seeded demo customer `+972-52-3841176` and the default admin — never on a real/production customer.** No `sync:*`, `seed:*`, `migrate-*`, or `backfill-*` script was run.

| # | Write | Reverted? | Notes |
|---|-------|-----------|-------|
| 1 | Admin + customer logins (session cookies) | n/a | reads only, no data change |
| 2 | Created 1 probe banner `AUDIT imageUrl probe` | **Deactivated** (`isActive:false`) | Not hard-deleted (audit rules + no delete endpoint). Invisible to customers. Reproduction evidence for Bug B2. |
| 3 | Ran `scripts/smoke.mjs` (full suite) | Partially self-restoring | The smoke script restores most state (discounts/promos/banners set `isActive:false`; statuses restored; carts cleared), but **placed orders are not reversible**: order count **301 → 305** (+4 orders on the seed customer from the pricing/promo/overview/ledger sections; the ledger section's order was set to `cancelled`). Also persisted: SMOKE-labelled ledger payment entries on the seed customer, and the reused `SMOKE agent (auto)` user. **This is inherent to the existing smoke script, not to extra audit writes.** |

**Restoration status:** the probe banner is deactivated (harmless). The 4 smoke-placed orders and SMOKE ledger entries remain on the **demo** customer — they cannot be cleanly reverted (hard-delete is prohibited by the audit rules and no order-delete endpoint exists). No real-customer or catalog data was altered. The default admin password was **used** (M2) but **not changed**.

---

# Bugs Found

### B1 — Backfill/migration/seed scripts write by default (Medium)
- **Repro:** `grep -n "DRY" scripts/migrate-account-status.js` → `const DRY = args.includes("--dry")`. Same in `backfill-ledger.js`, `seed-agents.js`.
- **Expected (per PROGRESS "dry-run only"):** default run makes no writes; a flag enables writing.
- **Actual:** default run (no flag) **writes to the real Atlas cluster**; `--dry` must be passed to suppress writes.
- **Evidence:** the three `const DRY = args.includes("--dry")` declarations; all three connect to `MONGODB_URI` from `.env.local` (the shared cluster). **Not executed during this audit.**
- **Impact:** an operator following the docs' "dry-run" framing, or omitting the flag, mutates production data (account statuses, ledger entries, agent users) irreversibly.

### B2 — Smoke "banner imageUrl round-trips" fails; underlying feature is fine (Low)
- **Repro (test):** `node scripts/smoke.mjs` → `FAIL banner: imageUrl round-trips to the customer feed — imageUrl=undefined`.
- **Repro (feature, passes):**
  ```
  POST /api/admin/banners {title:"AUDIT imageUrl probe",scope:"global",priority:95,imageUrl:"…/audit-probe.jpg"}
  → admin list row:  imageUrl = "https://…/audit-probe.jpg"
  → customer /api/banners row: imageUrl = "https://…/audit-probe.jpg"   ✅ round-trips
  ```
- **Expected:** the created image banner appears in the customer feed with its imageUrl.
- **Actual:** the customer feed is capped at **max 3 by priority**; the smoke image banner (priority 96) is created *after* three higher-priority test banners (99/98/97), so it is ranked out of the feed and the test reads `undefined`. Not a code fault — a test that ignores the max-3 cap. PROGRESS §2AD's "57/57" is stale.
- **Impact:** false-negative in the smoke suite; misleading doc claim. No user-facing defect.

### B3 — Repo lint gate red (Low)
- **Repro:** `npm run lint` → exit 1, `✖ 12 problems (6 errors, 6 warnings)`; errors are `@typescript-eslint/no-require-imports` in `scripts/cache-category-images.js` and `scripts/train-oriental-sweets-customer.js`.
- **Expected (per PROGRESS):** eslint clean.
- **Actual:** `src/` is clean, but the canonical `npm run lint` (whole repo) fails on two dev-utility scripts using CommonJS `require()`.
- **Impact:** CI/lint gate as documented does not pass; no shipped code affected.

### M2 restated as a bug — Default admin password live (Medium)
- **Repro:** `POST /api/auth/admin/login {identifier:"admin@sari.com",password:"Admin1234"}` → 200 + admin token, against the real Atlas cluster.
- **Expected:** default credential rotated before any non-local exposure (PROGRESS §7 / backlog #1).
- **Actual:** still valid.
- **Impact:** full admin-console compromise for anyone who can reach the host.

---

# Untested Areas

Marked **NOT TESTED** — with reason.

- **AI assistant end-to-end (tool-calling agent, streaming, memory, eval harness).** `SMOKE_AI=1` + `scripts/assistant-eval.mjs` both call OpenAI (real cost, latency, nondeterminism). Not run. All PROGRESS §2AA/§2AG/§2C claims about live assistant behavior are therefore **unverified by this audit**.
- **Order-creation transaction atomicity under fault.** The single-txn create+cart-clear (PROGRESS §2P) was not fault-injected (can't crash mid-txn from outside); only the happy path and the standalone-Mongo fallback logic are covered by existing tests.
- **Dev-endpoint production gating.** `/api/products/seed`, `/api/products/import-from-site` are documented to 403 under `NODE_ENV=production`; not re-verified here (server runs in dev mode). `/api/test` route exists — purpose/exposure not audited.
- **Test flakiness.** Unit + smoke were each run once (green). Not repeated under load, so intermittent flakiness cannot be ruled out.
- **UI / visual / accessibility (Tasks A & B: contrast ratios, RTL, 390px, reduced-motion).** No browser automation run; the WCAG ratios and layout claims in §2AC/§2AD are **not** independently measured here — only the API/data layer of the banner (imageUrl round-trip) was verified.
- **nginx / deployment ops (SSE proxy-buffering, pm2 fork mode).** Config-only, no running proxy to test.

---

## Appendix — Commands of record

```
npx tsc --noEmit                                  → exit 0
npx eslint src                                    → exit 0
npm run lint                                      → exit 1 (6 errors in 2 scripts)
npm test                                          → 328 passed, exit 0
npm run build                                     → exit 0
ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/smoke.mjs → 70 passed, 1 failed
curl POST /api/admin/banners {…imageUrl…} + GET /api/banners  → imageUrl round-trips (feature OK)
curl (customer token → admin endpoints)           → 401 ×4
curl (unauth → protected reads)                   → 401 ×4
curl (customer B → customer A receipt)            → 404
git status                                         → clean except docs/TESTS-CHECK.md
```
