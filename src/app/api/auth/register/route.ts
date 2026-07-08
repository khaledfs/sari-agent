import { NextResponse } from "next/server";

import { registerCustomer } from "@/services/auth.service";
import type { RegisterInput } from "@/types/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<RegisterInput> & {
      role?: string;
    };

    const payload: RegisterInput = {
      businessName: body.businessName ?? "",
      email: body.email ?? "",
      phoneNumber: body.phoneNumber ?? "",
      password: body.password ?? "",
    };

    await registerCustomer(payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to register user.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
