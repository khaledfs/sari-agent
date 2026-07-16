import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getLedgerForUser } from "@/services/ledger.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

/**
 * The customer's OWN ledger (Work Order Issue 8) — real entries, computed
 * running balance, minor units (agorot). The former mock payments/checks/
 * invoices payload is gone. Identity comes from the session only; there is no
 * way to request another customer's ledger through this route.
 */
export async function GET(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }
    const url = new URL(req.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
    const data = await getLedgerForUser(userId, {
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 25,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load ledger.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
