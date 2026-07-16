/**
 * Stable error vocabulary for the console authorization layer (Task D).
 * Kept dependency-free so both auth-user and actor-scope can import it.
 *
 * Contract:
 * - role violation (an agent hitting an admin-only surface) → 403
 *   { code: "FORBIDDEN_SCOPE" } — the surface exists, the role may not use it.
 * - scope violation (an agent touching another agent's customer) → 404 —
 *   never reveal that the entity exists.
 */
export const FORBIDDEN_SCOPE_MESSAGE = "Forbidden scope.";
export const FORBIDDEN_SCOPE_CODE = "FORBIDDEN_SCOPE";
