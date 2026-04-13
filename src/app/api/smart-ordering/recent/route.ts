import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getRecentProductsByUser } from "@/services/smart-ordering.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return unauthorized();
  }
  try {
    const data = await getRecentProductsByUser(userId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load recent products.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
