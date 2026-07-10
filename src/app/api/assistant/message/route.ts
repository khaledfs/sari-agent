import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { runAssistantAdvisorQuery } from "@/services/assistant-advisor.service";
import { runAssistantCartCommand } from "@/services/assistant-command.service";
import { classifyAssistantMessageRoute } from "@/services/assistant-router.service";
import { updateMemoryAfterConversation } from "@/services/customer-memory.service";

const bodySchema = z.object({
  message: z.string().trim().min(1, "message is required."),
  locale: z.enum(["he", "en", "ar"]).optional().default("he"),
  /** Prior turns of the current chat session (client state only, max last 10 used). */
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      })
    )
    .max(50)
    .optional()
    .default([]),
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

    const history = body.history.slice(-10);
    const route = await classifyAssistantMessageRoute(body.message, history);
    const data =
      route === "cart"
        ? await runAssistantCartCommand(userId, body.message, history)
        : await runAssistantAdvisorQuery(userId, body.message, body.locale, history);

    // Fire-and-forget: learn about the customer from this turn without ever
    // delaying or failing the response.
    void updateMemoryAfterConversation(userId, [
      { role: "user", content: body.message },
      { role: "assistant", content: data.message },
    ]).catch((error) => {
      console.error("customer-memory update failed:", error);
    });

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process assistant message.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
