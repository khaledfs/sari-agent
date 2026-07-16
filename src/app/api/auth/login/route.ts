import { NextResponse } from "next/server";

import { loginWithPassword } from "@/services/auth.service";
import type { LoginInput } from "@/types/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<LoginInput>;

    const identifier = body.identifier ?? "";
    const password = body.password ?? "";

    const result = await loginWithPassword({ identifier, password });

    const res = NextResponse.json({ success: true, token: result.token });
    // MVP: also store token in cookie for persistence / server checks
    res.cookies.set("authToken", result.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to login.";
    const status = message === "Account disabled." ? 401 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}

