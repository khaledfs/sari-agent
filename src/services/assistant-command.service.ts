import { z } from "zod";

import { addToCart, removeCartItem, updateCartItem } from "@/services/cart.service";
import { parseCartCommandWithOpenAI } from "@/services/assistant-parser.service";
import { matchActiveProductByQuery } from "@/services/product-matching.service";
import type { ParsedCartCommand } from "@/types/assistant";

const commandInputSchema = z.object({
  userId: z.string().trim().min(1, "userId is required."),
  message: z.string().trim().min(1, "message is required."),
});

export type AssistantCommandResult = {
  parsed: ParsedCartCommand;
  matchedProduct: {
    productId: string;
    name: string;
    sku: string;
    category: string;
    score: number;
    reason: string;
  } | null;
  actionResult: "added" | "updated" | "removed" | "failed";
  cart?: Awaited<ReturnType<typeof addToCart>>;
  message: string;
};

export async function runAssistantCartCommand(
  userId: string,
  message: string
): Promise<AssistantCommandResult> {
  const input = commandInputSchema.parse({ userId, message });
  const parsed = await parseCartCommandWithOpenAI(input.message);
  const matched = await matchActiveProductByQuery(parsed.productQuery);

  if (!matched) {
    return {
      parsed,
      matchedProduct: null,
      actionResult: "failed",
      message: "No matching active product found.",
    };
  }

  if (parsed.action === "add") {
    const quantity = parsed.quantity ?? 1;
    if (quantity <= 0) {
      return {
        parsed,
        matchedProduct: matched,
        actionResult: "failed",
        message: "Invalid quantity for add.",
      };
    }
    const cart = await addToCart(input.userId, matched.productId, quantity);
    return {
      parsed,
      matchedProduct: matched,
      actionResult: "added",
      cart,
      message: `Added ${quantity} x ${matched.name} to cart.`,
    };
  }

  if (parsed.action === "update") {
    if (parsed.quantity === null || parsed.quantity <= 0) {
      return {
        parsed,
        matchedProduct: matched,
        actionResult: "failed",
        message: "Quantity is required for update and must be greater than 0.",
      };
    }
    const cart = await updateCartItem(input.userId, matched.productId, parsed.quantity);
    return {
      parsed,
      matchedProduct: matched,
      actionResult: "updated",
      cart,
      message: `Updated ${matched.name} quantity to ${parsed.quantity}.`,
    };
  }

  const cart = await removeCartItem(input.userId, matched.productId);
  return {
    parsed,
    matchedProduct: matched,
    actionResult: "removed",
    cart,
    message: `Removed ${matched.name} from cart.`,
  };
}

