import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/user.model";

const ADMIN_DEFAULTS = {
  businessName: "Sari Admin",
  email: "admin@sari.com",
  phoneNumber: "+972500000000",
  password: "Admin1234",
};

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, message: "Seed endpoint is disabled in production." },
      { status: 403 }
    );
  }

  try {
    await connectDB();

    const existing = await UserModel.findOne({ email: ADMIN_DEFAULTS.email }).lean();
    if (existing) {
      return NextResponse.json({
        success: true,
        message: "Admin user already exists.",
        data: { email: ADMIN_DEFAULTS.email },
      });
    }

    const hashedPassword = await bcrypt.hash(ADMIN_DEFAULTS.password, 10);

    await UserModel.create({
      businessName: ADMIN_DEFAULTS.businessName,
      email: ADMIN_DEFAULTS.email,
      phoneNumber: ADMIN_DEFAULTS.phoneNumber,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
    });

    return NextResponse.json({
      success: true,
      message: "Admin user created.",
      data: {
        email: ADMIN_DEFAULTS.email,
        password: ADMIN_DEFAULTS.password,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to seed admin.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
