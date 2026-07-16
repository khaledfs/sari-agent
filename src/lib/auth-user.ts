import { cookies } from "next/headers";

import { verifyAuthToken } from "@/lib/jwt";
import { FORBIDDEN_SCOPE_MESSAGE } from "@/lib/scope-errors";
import type { JwtPayload } from "@/types/session";

/**
 * Reads authToken from cookies and returns JWT userId.
 * Used by API routes; does not contain cart/business logic.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const store = await cookies();
    const token = store.get("authToken")?.value;
    if (!token) {
      return null;
    }
    const payload = verifyAuthToken(token);
    return payload.userId;
  } catch {
    return null;
  }
}

/**
 * Verifies the caller is an authenticated admin (admin-ONLY surfaces).
 * An agent gets the stable 403 FORBIDDEN_SCOPE error (the surface exists but
 * their role may not use it — Task D); anyone else gets the 401 errors.
 * For surfaces agents MAY use with scoping, use resolveActorScope() instead.
 */
export async function requireAdmin(): Promise<JwtPayload> {
  const store = await cookies();
  const token = store.get("authToken")?.value;
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const payload = verifyAuthToken(token);
  if (payload.role === "agent") {
    throw new Error(FORBIDDEN_SCOPE_MESSAGE);
  }
  if (payload.role !== "admin") {
    throw new Error("Access denied.");
  }
  return payload;
}

/**
 * Verifies the caller may use the admin CONSOLE at all (admin or agent).
 * Scoping decisions happen in resolveActorScope / the per-surface guards.
 */
export async function requireConsoleUser(): Promise<JwtPayload> {
  const store = await cookies();
  const token = store.get("authToken")?.value;
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const payload = verifyAuthToken(token);
  if (payload.role !== "admin" && payload.role !== "agent") {
    throw new Error("Access denied.");
  }
  return payload;
}
