import { cookies } from "next/headers";

import { verifyAuthToken } from "@/lib/jwt";
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
 * Verifies the caller is an authenticated admin.
 * Throws if not authenticated or not an admin.
 */
export async function requireAdmin(): Promise<JwtPayload> {
  const store = await cookies();
  const token = store.get("authToken")?.value;
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const payload = verifyAuthToken(token);
  if (payload.role !== "admin") {
    throw new Error("Access denied.");
  }
  return payload;
}
