import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAuthToken } from "@/lib/jwt";

export async function GET() {
  try {
    const store = await cookies();
    const token = store.get("authToken")?.value;
    if (!token) {
      return NextResponse.json(
        { success: true, data: { authenticated: false } },
        { status: 200 }
      );
    }

    const payload = verifyAuthToken(token);
    return NextResponse.json(
      { success: true, data: { authenticated: true, payload } },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: true, data: { authenticated: false } },
      { status: 200 }
    );
  }
}

