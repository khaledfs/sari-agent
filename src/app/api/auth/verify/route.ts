import { NextResponse } from "next/server";

import { verifyCustomerPhone } from "@/services/auth.service";
import type { VerifyInput } from "@/types/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<VerifyInput>;

    const payload: VerifyInput = {
      phoneNumber: body.phoneNumber ?? "",
      code: body.code ?? "",
    };

    await verifyCustomerPhone(payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to verify phone number.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
