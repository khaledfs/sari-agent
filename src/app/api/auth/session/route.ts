import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/lib/jwt";
import { getAccountStatus } from "@/services/account-status.service";

export async function GET() {
  try {
    const store = await cookies();
    const token = store.get("authToken")?.value;
    if (!token) {
      return NextResponse.json(
        { success: true, data: { authenticated: false } },
        { status: 200 }
      );
    }

    const payload = verifyAuthToken(token);
    // Current ordering permission comes from the DB, not the token — the token
    // predates any restriction (Work Order Issue 3). Fail-soft to "active":
    // the server-side guard is the real enforcement; this only drives UI.
    let accountStatus: "active" | "restricted" = "active";
    if (payload.role === "customer") {
      try {
        accountStatus = await getAccountStatus(payload.userId);
      } catch {
        accountStatus = "active";
      }
    }
    return NextResponse.json(
      { success: true, data: { authenticated: true, payload, accountStatus } },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: true, data: { authenticated: false } },
      { status: 200 }
    );
  }
}

