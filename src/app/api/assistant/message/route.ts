import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { runAssistantAdvisorQuery } from "@/services/assistant-advisor.service";
import { runAssistantCartCommand } from "@/services/assistant-command.service";
import { classifyAssistantMessageRoute } from "@/services/assistant-router.service";

const bodySchema = z.object({
  message: z.string().trim().min(1, "message is required."),
  locale: z.enum(["he", "en", "ar"]).optional().default("he"),
});

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

/**
 * Unified entry point that routes a message to the existing cart/order
 * pipeline (unchanged) or the new advisor pipeline. The legacy
 * /api/assistant/cart-command route is left untouched and still works as-is
 * (used directly for clarification resolveSelection continuations).
 */
export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }

    const rawBody = (await req.json().catch(() => ({}))) as unknown;
    const body = bodySchema.parse(rawBody);

    const route = await classifyAssistantMessageRoute(body.message);
    const data =
      route === "cart"
        ? await runAssistantCartCommand(userId, body.message)
        : await runAssistantAdvisorQuery(userId, body.message, body.locale);

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process assistant message.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
