import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-user";
import { changeAdminPassword } from "@/services/auth.service";

export async function POST(req: Request) {
  try {
    const payload = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      currentPassword?: string;
      newPassword?: string;
    };

    await changeAdminPassword(payload.userId, body.currentPassword ?? "", body.newPassword ?? "");
    return NextResponse.json({ success: true, message: "Password updated." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to change password.";
    const status = message === "Not authenticated." || message === "Access denied." ? 401 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
