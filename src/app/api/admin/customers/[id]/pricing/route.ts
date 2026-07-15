import { NextResponse } from "next/server";

import { getCustomerPricingSummary } from "@/lib/admin-pricing";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ success: true, data: await getCustomerPricingSummary(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch customer pricing.";
    const status =
      message === "Not authenticated." || message === "Access denied."
        ? 401
        : message === "Customer not found."
          ? 404
          : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
