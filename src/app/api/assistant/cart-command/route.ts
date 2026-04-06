import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { runAssistantCartCommand } from "@/services/assistant-command.service";

const bodySchema = z.object({
  message: z.string().trim().min(1, "message is required."),
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
    const data = await runAssistantCartCommand(userId, body.message);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to execute assistant cart command.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

