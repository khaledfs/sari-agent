import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import {
  addFavoriteProduct,
  getFavoriteProductsByUser,
  removeFavoriteProduct,
} from "@/services/favorites.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

const bodySchema = z.object({
  productId: z.string().min(1, "productId is required."),
});

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return unauthorized();
  }
  try {
    const data = await getFavoriteProductsByUser(userId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load favorites.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return unauthorized();
  }
  try {
    const json = await req.json();
    const { productId } = bodySchema.parse(json);
    await addFavoriteProduct(userId, productId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to add favorite.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return unauthorized();
  }
  try {
    const json = await req.json();
    const { productId } = bodySchema.parse(json);
    await removeFavoriteProduct(userId, productId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to remove favorite.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
