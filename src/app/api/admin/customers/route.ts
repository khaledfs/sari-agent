import { NextResponse } from "next/server";

import { listAdminCustomers } from "@/lib/admin-customers";

export async function GET() {
  try {
    const data = await listAdminCustomers();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch customers.";
    const status = message === "Not authenticated." || message === "Access denied." ? 401 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
