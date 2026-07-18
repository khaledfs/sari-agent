import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import { getAdminCustomerLedger, postAdminLedgerEntry } from "@/lib/admin-ledger";
import { getOpenCollectionsForCustomer } from "@/services/collection-tasks.service";

function mapError(error: unknown, fallback: string) {
  return mapAdminRouteError(error, fallback);
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = new URL(req.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
    // getAdminCustomerLedger asserts scope first; the open-collections list (for
    // the "which order does this payment settle" selector) is same-customer.
    const ledger = await getAdminCustomerLedger(id, {
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 25,
    });
    const openCollections = await getOpenCollectionsForCustomer(id);
    return NextResponse.json({ success: true, data: { ...ledger, openCollections } });
  } catch (error) {
    return mapError(error, "Failed to load ledger.");
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data = await postAdminLedgerEntry(id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return mapError(error, "Failed to record entry.");
  }
}
