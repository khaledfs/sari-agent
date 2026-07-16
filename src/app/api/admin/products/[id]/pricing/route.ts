import { NextResponse } from "next/server";

import { mapAdminRouteError } from "@/lib/admin-route-errors";

import {
  getProductPricing,
  removeCustomerPriceOverride,
  setCustomerPriceOverride,
  setProductTierPrices,
} from "@/lib/admin-pricing";


function fail(error: unknown, fallback: string) {
  return mapAdminRouteError(error, fallback);
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ success: true, data: await getProductPricing(id) });
  } catch (error) {
    return fail(error, "Failed to fetch pricing.");
  }
}

/** PATCH body: { tierPrices?: Record<businessType, number|null> } */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { tierPrices?: Record<string, unknown> };
    return NextResponse.json({
      success: true,
      data: await setProductTierPrices(id, body.tierPrices ?? {}),
    });
  } catch (error) {
    return fail(error, "Failed to update tier prices.");
  }
}

/** POST body: { userId, price } — set/replace a per-customer override. */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { userId?: string; price?: number };
    return NextResponse.json({
      success: true,
      data: await setCustomerPriceOverride(id, String(body.userId ?? ""), Number(body.price)),
    });
  } catch (error) {
    return fail(error, "Failed to set override.");
  }
}

/** DELETE ?userId= — remove a per-customer override. */
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = new URL(req.url);
    return NextResponse.json({
      success: true,
      data: await removeCustomerPriceOverride(id, url.searchParams.get("userId") ?? ""),
    });
  } catch (error) {
    return fail(error, "Failed to remove override.");
  }
}
