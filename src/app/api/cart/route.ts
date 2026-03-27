import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { addToCart, getCartByUserId, removeCartItem, updateCartItem } from "@/services/cart.service";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }
    const data = await getCartByUserId(userId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load cart.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }
    const body = (await req.json()) as { productId?: string; quantity?: number };
    const data = await addToCart(userId, body.productId ?? "", Number(body.quantity));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add to cart.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }
    const body = (await req.json()) as { productId?: string; quantity?: number };
    const data = await updateCartItem(userId, body.productId ?? "", Number(body.quantity));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update cart.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorized();
    }
    const body = (await req.json()) as { productId?: string };
    const data = await removeCartItem(userId, body.productId ?? "");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove item.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
