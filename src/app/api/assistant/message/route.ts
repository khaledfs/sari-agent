import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { runAssistantAgentTurn } from "@/services/assistant-agent.service";
import { updateMemoryAfterConversation } from "@/services/customer-memory.service";

/** SSE responses must never be statically cached. */
export const dynamic = "force-dynamic";

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
  /**
   * Task C: opt-in streaming. true → the response is an SSE stream of
   * {type:"delta"|"status"|"final"|"error"} events; absent/false → the
   * original JSON contract, unchanged for every existing caller.
   */
  stream: z.boolean().optional().default(false),
});

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function fireMemoryUpdate(userId: string, message: string, answer: string) {
  // Fire-and-forget: learn about the customer from this turn without ever
  // delaying or failing the response (verified still non-blocking — Task C).
  void updateMemoryAfterConversation(userId, [
    { role: "user", content: message },
    { role: "assistant", content: answer },
  ]).catch((error) => {
    console.error("customer-memory update failed:", error);
  });
}

/**
 * Unified entry point (Work Order Issue 6 + Task C): ONE catalog-grounded
 * tool-calling agent turn — no intent branching. Legacy
 * /api/assistant/cart-command and /api/assistant/resolve-clarification keep
 * working (the UI uses resolve-clarification for option-pick continuations).
 */
export async function POST(req: Request) {
  let parsed: z.infer<typeof bodySchema>;
  let userId: string;
  try {
    userId = (await getAuthenticatedUserId()) ?? "";
    if (!userId) {
      return unauthorized();
    }
    const rawBody = (await req.json().catch(() => ({}))) as unknown;
    parsed = bodySchema.parse(rawBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process assistant message.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }

  const history = parsed.history.slice(-10);

  if (!parsed.stream) {
    // Legacy JSON contract — byte-compatible with every existing caller.
    try {
      const data = await runAssistantAgentTurn(userId, parsed.message, parsed.locale, history, {
        signal: req.signal,
      });
      fireMemoryUpdate(userId, parsed.message, data.message);
      return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process assistant message.";
      return NextResponse.json({ success: false, message }, { status: 400 });
    }
  }

  // Streaming path: SSE events, aborted server-side via req.signal so a
  // closed panel never leaves an orphaned generation burning tokens.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      void (async () => {
        try {
          const data = await runAssistantAgentTurn(userId, parsed.message, parsed.locale, history, {
            signal: req.signal,
            onEvent: (event) => send(event),
          });
          fireMemoryUpdate(userId, parsed.message, data.message);
          send({ type: "final", data });
        } catch (error) {
          if (!req.signal.aborted) {
            const message = error instanceof Error ? error.message : "Assistant failed.";
            send({ type: "error", message });
          }
        } finally {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by abort
          }
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx: disable per-response proxy buffering (see DEV_NOTES §25).
      "X-Accel-Buffering": "no",
    },
  });
}
