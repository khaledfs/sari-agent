import { NextResponse } from "next/server";

import { registerCustomer } from "@/services/auth.service";
import type { RegisterInput } from "@/types/auth";
import { BUSINESS_ONBOARDING_TYPES, type BusinessOnboardingType } from "@/types/business-type";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<RegisterInput> & {
      role?: string;
    };

    const rawBusinessType = body.businessType;
    if (
      typeof rawBusinessType !== "string" ||
      !BUSINESS_ONBOARDING_TYPES.includes(rawBusinessType as BusinessOnboardingType)
    ) {
      throw new Error("Invalid business type.");
    }

    const payload: RegisterInput = {
      businessName: body.businessName ?? "",
      email: body.email ?? "",
      phoneNumber: body.phoneNumber ?? "",
      password: body.password ?? "",
      businessType: rawBusinessType as BusinessOnboardingType,
    };

    await registerCustomer(payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to register user.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
