import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/lib/jwt";
import { getCustomerThread, sendCustomerMessage } from "@/services/messaging.service";

/**
 * The CUSTOMER's messaging surface (Task D): always their OWN thread with
 * their assigned agent — identity from the session only, no ids accepted.
 * Restricted customers may message (this is how a hold gets resolved).
 */
async function customerIdFromSession(): Promise<string | null> {
  try {
    const store = await cookies();
    const token = store.get("authToken")?.value;
    if (!token) return null;
    const payload = verifyAuthToken(token);
    return payload.role === "customer" ? payload.userId : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const customerId = await customerIdFromSession();
  if (!customerId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const data = await getCustomerThread(customerId, Number.isFinite(page) ? page : 1);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load messages.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const customerId = await customerIdFromSession();
  if (!customerId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { body?: unknown };
    const data = await sendCustomerMessage(customerId, String(body.body ?? ""));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send message.";
    if (message === "No agent assigned.") {
      return NextResponse.json({ success: false, message, code: "NO_AGENT_ASSIGNED" }, { status: 400 });
    }
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
