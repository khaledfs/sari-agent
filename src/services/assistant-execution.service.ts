import { z } from "zod";

import { addToCart, removeCartItem, updateCartItem } from "@/services/cart.service";
import { getProductById } from "@/services/product.service";
import {
  buildAssistantActionMessage,
  buildAssistantInfoMessage,
} from "@/services/assistant-explanation.service";
import type {
  AssistantCommandResponse,
  AssistantIntent,
  AssistantMatchedProduct,
  ParsedAssistantCommand,
} from "@/types/assistant";

type CartResult = Awaited<ReturnType<typeof addToCart>>;

export async function runCartMutation(
  userId: string,
  parsed: ParsedAssistantCommand,
  chosen: AssistantMatchedProduct
): Promise<{ actionResult: AssistantCommandResponse["actionResult"]; cart?: CartResult; message: string }> {
  if (parsed.intent === "add" || parsed.intent === "reorder_habit") {
    const quantity = parsed.quantity ?? 1;
    const cart = await addToCart(userId, chosen.productId, quantity);
    return {
      actionResult: "added",
      cart,
      message: buildAssistantActionMessage("added", chosen, quantity),
    };
  }

  if (parsed.intent === "update") {
    const quantity = parsed.quantity ?? 0;
    if (quantity <= 0) {
      return {
        actionResult: "failed",
        message: "כדי לעדכן כמות צריך לציין מספר גדול מ-0.",
      };
    }
    const cart = await updateCartItem(userId, chosen.productId, quantity);
    return {
      actionResult: "updated",
      cart,
      message: buildAssistantActionMessage("updated", chosen, quantity),
    };
  }

  const cart = await removeCartItem(userId, chosen.productId);
  return {
    actionResult: "removed",
    cart,
    message: buildAssistantActionMessage("removed", chosen),
  };
}

/**
 * Deterministic follow-up when the client already picked a product (e.g. legacy resolveSelection).
 * Skips LLM parsing and executes info/cart actions directly.
 */
export async function runAssistantCartCommandResolved(
  userId: string,
  selection: {
    productId: string;
    intent: AssistantIntent;
    quantity?: number | null;
  }
): Promise<AssistantCommandResponse> {
  z.string().trim().min(1).parse(userId);

  const { intent } = selection;
  if (intent === "compare" || intent === "clarify") {
    return {
      intent,
      actionResult: "failed",
      message: "לא ניתן להשלים את הפעולה בבחירה ישירה. המשך עם הודעה מלאה.",
      matchedProducts: [],
      chosenProduct: null,
      clarification: null,
    };
  }

  const raw = await getProductById(selection.productId);
  if (!raw.isActive) {
    return {
      intent,
      actionResult: "failed",
      message: "המוצר אינו זמין להזמנה.",
      matchedProducts: [],
      chosenProduct: null,
      clarification: null,
    };
  }

  const chosen: AssistantMatchedProduct = {
    productId: String(raw._id),
    name: raw.name,
    sku: raw.sku,
    category: raw.category ?? "",
    price: raw.price,
    unit: raw.unit ?? "",
    packageSize: raw.packageSize ?? "",
    imageUrl: raw.imageUrl || undefined,
    score: 100,
    reasons: ["resolved_selection"],
    sources: ["resolve"],
  };

  const quantityForMutation =
    intent === "remove" || intent === "info"
      ? null
      : intent === "add" || intent === "reorder_habit"
        ? (selection.quantity ?? 1)
        : intent === "update"
          ? (selection.quantity ?? 1)
          : null;

  const parsed: ParsedAssistantCommand = {
    intent,
    productQuery: chosen.name,
    productQueries: undefined,
    quantity: quantityForMutation,
  };

  if (intent === "info") {
    return {
      intent,
      actionResult: "info",
      message: buildAssistantInfoMessage(chosen),
      matchedProducts: [chosen],
      chosenProduct: chosen,
      clarification: null,
      metadata: { resolvedSelection: true, parsed },
    };
  }

  const mutation = await runCartMutation(userId, parsed, chosen);
  return {
    intent,
    actionResult: mutation.actionResult,
    message: mutation.message,
    matchedProducts: [chosen],
    chosenProduct: chosen,
    clarification: null,
    cart: mutation.cart,
    metadata: { resolvedSelection: true, parsed },
  };
}

export async function matchedProductFromDb(productId: string): Promise<AssistantMatchedProduct> {
  const raw = await getProductById(productId);
  if (!raw.isActive) {
    throw new Error("PRODUCT_INACTIVE");
  }
  return {
    productId: String(raw._id),
    name: raw.name,
    sku: raw.sku,
    category: raw.category ?? "",
    price: raw.price,
    unit: raw.unit ?? "",
    packageSize: raw.packageSize ?? "",
    imageUrl: raw.imageUrl || undefined,
    score: 100,
    reasons: ["resolved_selection"],
    sources: ["resolve"],
  };
}
