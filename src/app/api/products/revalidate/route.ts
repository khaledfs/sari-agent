import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdmin } from "@/lib/auth-user";
import { PRODUCTS_CACHE_TAG } from "@/services/product.service";

/**
 * Internal cache-bust endpoint for out-of-band catalog writes (the sync
 * script). Accepts either an admin session cookie or the shared secret header
 * (x-revalidate-secret === REVALIDATE_SECRET). The catalog cache also has a
 * TTL fallback, so a missed call only means bounded staleness.
 */
export async function POST(req: Request) {
  try {
    const secret = process.env.REVALIDATE_SECRET?.trim();
    const provided = req.headers.get("x-revalidate-secret")?.trim();
    let authorized = Boolean(secret && provided && provided === secret);

    if (!authorized) {
      try {
        await requireAdmin();
        authorized = true;
      } catch {
        authorized = false;
      }
    }

    if (!authorized) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    revalidateTag(PRODUCTS_CACHE_TAG, { expire: 0 });
    return NextResponse.json({ success: true, data: { revalidated: [PRODUCTS_CACHE_TAG] } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revalidate.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
