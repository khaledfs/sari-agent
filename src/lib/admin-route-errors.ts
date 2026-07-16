import { NextResponse } from "next/server";

import { FORBIDDEN_SCOPE_CODE, FORBIDDEN_SCOPE_MESSAGE } from "@/lib/scope-errors";

/**
 * One error→status mapping for every console route (Task D): 401 for
 * missing/insufficient auth, 403 { code: "FORBIDDEN_SCOPE" } for role
 * violations, 404 for "…not found." (including scope violations, which
 * deliberately read as not-found), 400 for everything else.
 */
export function mapAdminRouteError(error: unknown, fallback: string): NextResponse {
  const message = error instanceof Error ? error.message : fallback;
  if (message === FORBIDDEN_SCOPE_MESSAGE) {
    return NextResponse.json(
      { success: false, message, code: FORBIDDEN_SCOPE_CODE },
      { status: 403 }
    );
  }
  const status =
    message === "Not authenticated." || message === "Access denied."
      ? 401
      : message.endsWith("not found.")
        ? 404
        : 400;
  return NextResponse.json({ success: false, message }, { status });
}
