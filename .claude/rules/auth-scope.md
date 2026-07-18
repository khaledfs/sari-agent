# Auth, identity & scope

Migrated from `docs/WORKING_INSTRUCTIONS.md` §3.2, §3.7, §3.9, §6.

## Session & identity
- **Session source of truth:** `authToken` httpOnly cookie + JWT (login route, `src/lib/jwt.ts`).
- Identify the user on the server via `src/lib/auth-user.ts` → **`getAuthenticatedUserId()`** in API routes.
- **Never trust `userId` (or role) from client input** for cart, orders, or any protected resource. Do not accept a user id from query/body for authorization.

## Stable auth flows (do not regress without explicit intent)
- register → verify → login → session → logout are **stable contracts**. Changes must be careful, minimal, and tested. Never "refactor auth" as a side effect of feature work.

## Console authorization (admin + field agents)
- **Every admin-side endpoint goes through the shared scope resolver** (`resolveActorScope()` / `assertCanActOnCustomer` / `assertAdminOnly` in `src/lib/actor-scope.ts`) — never a hand-rolled per-route check. Scope is loaded from the DB per request; token claims are only the entry ticket.
- **Deny by default.** Scope violations (another agent's customer) → **404** (never reveal existence). Role violations → **403 `{ code: "FORBIDDEN_SCOPE" }`** via `mapAdminRouteError`.
- `agentId`/`customerId` scope values are NEVER accepted from the client.
- Rules affecting more than one customer (global/businessType discounts, promotions, banners, tier prices, catalog writes) are **admin-only**.

## Account restriction (ordering hold)
- `user.accountStatus` (`"active" | "restricted"`) is the **single source of truth** for ordering permission. Legacy `user.isActive` is read-only compatibility — never enforce it anywhere new, and never block login for a restricted customer.
- Every cart-mutating or order-creating service function MUST call **`requireOrderingEnabled(userId)`** (`account-status.service`), which reads the CURRENT DB state — never trust JWT claims for this.
- Routes map the guard error via `mapAccountRestrictedError()` → `403 { code: "ACCOUNT_RESTRICTED" }`. Frontend disabling is UX only, never the enforcement.
- Restricted customers keep ALL read access (orders, ledger, catalog, receipts, realtime) and can message their agent.
