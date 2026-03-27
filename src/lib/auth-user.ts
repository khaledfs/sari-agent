import { cookies } from "next/headers";

import { verifyAuthToken } from "@/lib/jwt";

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
