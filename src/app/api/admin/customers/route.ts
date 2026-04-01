import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-user";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/user.model";

export async function GET() {
  try {
    await requireAdmin();
    await connectDB();

    const customers = await UserModel.find(
      { role: "customer" },
      { password: 0 }
    )
      .sort({ createdAt: -1 })
      .lean();

    const data = customers.map((c) => ({
      _id: String(c._id),
      businessName: c.businessName,
      email: c.email,
      phoneNumber: c.phoneNumber,
      isVerified: c.isVerified,
      createdAt: c.createdAt,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch customers.";
    const status = message === "Not authenticated." || message === "Access denied." ? 401 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
