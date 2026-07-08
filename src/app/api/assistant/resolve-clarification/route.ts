import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { resolveAssistantClarification } from "@/services/assistant-clarification.service";

const bodySchema = z.object({
  clarificationId: z.string().trim().min(1, "clarificationId is required."),
  selectedProductId: z.string().trim().min(1, "selectedProductId is required."),
});

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }

    const rawBody = (await req.json().catch(() => ({}))) as unknown;
    const body = bodySchema.parse(rawBody);
    const data = await resolveAssistantClarification(userId, body.clarificationId, body.selectedProductId);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve clarification.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
