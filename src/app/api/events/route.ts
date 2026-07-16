import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/lib/jwt";
import { channelsForSubscriber, eventBus } from "@/services/event-bus.service";
import type { JwtPayload } from "@/types/session";

/** SSE must never be statically cached. */
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;
const encoder = new TextEncoder();

/**
 * Server-Sent Events stream (Work Order Issue 4).
 *
 * Auth comes from the session cookie (same as every API route); the role and
 * user id are derived server-side and decide the subscribed channels — a
 * channel name is NEVER accepted from the client. The browser's EventSource
 * reconnects automatically; missed events are recovered by consumers
 * refetching their authoritative endpoints on reconnect (no replay).
 */
export async function GET(req: Request) {
  let payload: JwtPayload;
  try {
    const store = await cookies();
    const token = store.get("authToken")?.value;
    if (!token) {
      throw new Error("Not authenticated.");
    }
    payload = verifyAuthToken(token);
  } catch {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const channels = channelsForSubscriber(payload.role, payload.userId);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      let heartbeat: ReturnType<typeof setInterval> | undefined = undefined;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed by the runtime on abort
        }
      };

      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };

      // Initial comment defeats intermediary buffering and confirms the stream.
      send(`: connected\nretry: 3000\n\n`);

      unsubscribe = eventBus.subscribe(channels, (event) => {
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      heartbeat = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx: disable per-response proxy buffering for this route.
      "X-Accel-Buffering": "no",
    },
  });
}
