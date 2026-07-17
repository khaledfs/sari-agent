import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { UserModel } from "@/models/user.model";
import { connectDB } from "@/lib/db";
import { isPaymentsEnabled } from "@/services/payments.service";
import { isValidObjectId } from "mongoose";

/**
 * Checkout payment options for the current customer: whether card is available
 * (PAYMENTS_ENABLED) and the assigned agent's name to show on the "pay via my
 * agent" option. No card data ever involved.
 */
export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    let agentName: string | null = null;
    if (isValidObjectId(userId)) {
      const me = (await UserModel.findById(userId, { assignedAgentId: 1 }).lean().exec()) as
        | { assignedAgentId?: unknown }
        | null;
      if (me?.assignedAgentId && isValidObjectId(String(me.assignedAgentId))) {
        const agent = (await UserModel.findById(String(me.assignedAgentId), { businessName: 1 }).lean().exec()) as
          | { businessName?: string }
          | null;
        agentName = agent?.businessName ?? null;
      }
    }
    return NextResponse.json({ success: true, data: { cardEnabled: isPaymentsEnabled(), agentName } });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to load payment options." }, { status: 400 });
  }
}
