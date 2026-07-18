# API contracts

Migrated from `docs/WORKING_INSTRUCTIONS.md` §5, §3.7, §3.9.

## Response shape (all endpoints)
```
{ success: boolean, data?: any, message?: string }
```
- **Success:** `{ success: true, data, ... }`
- **Failure:** `{ success: false, message }` with an appropriate HTTP status.

## Status codes
- `401` unauthenticated · `404` not found · `400` validation/business rule.
- **Scope violations return 404, never reveal existence** (e.g. another agent's customer).
- Role violations (agent on an admin-only surface) return `403 { code: "FORBIDDEN_SCOPE" }`.

## Structured errors
- Errors originate in **services** (throw `Error("...")` with a clear message) and are mapped in routes without duplicating business rules. Console routes share one mapper (`mapAdminRouteError` in `src/lib/admin-route-errors.ts`).

## Stable error codes (existing — reuse, never rename)
Codes are part of the client contract; verify against `src/` before adding new ones.
- `ACCOUNT_RESTRICTED` (403) — cart mutations / order creation / reorder while the account is on ordering hold.
- `FORBIDDEN_SCOPE` (403) — non-admin role on an admin-only surface.
- `RECEIPT_NOT_AVAILABLE` (403) — receipt requested before dispatch (or on a cancelled order).
- `NO_AGENT_ASSIGNED` (400) — customer messaging with no assigned agent.
- `ADJUSTMENT_INVALID` (400) / `ADJUSTMENT_NOT_ALLOWED` (403) — supplied-quantity adjustment rule violations.
- `PAYMENTS_DISABLED` (503) · `PAYMENT_RATE_LIMITED` (429) · `AMOUNT_MISMATCH` (400) — payments layer.
