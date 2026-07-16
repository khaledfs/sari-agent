import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { mapAccountRestrictedError } from "@/lib/api-guard-responses";
import { clearCart } from "@/services/cart.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function POST() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }
    const data = await clearCart(userId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const restricted = mapAccountRestrictedError(error);
    if (restricted) return restricted;
    const message = error instanceof Error ? error.message : "Failed to clear cart.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
