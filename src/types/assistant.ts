import { z } from "zod";

export const assistantIntentSchema = z.enum([
  "add",
  "update",
  "remove",
  "info",
  "compare",
  "reorder_habit",
  "clarify",
  "advice",
]);

export const parsedAssistantCommandSchema = z.object({
  intent: assistantIntentSchema,
  productQuery: z.string().trim().nullable(),
  productQueries: z.array(z.string().trim().min(1)).max(3).optional(),
  quantity: z.number().int().positive().nullable(),
});

export type AssistantIntent = z.infer<typeof assistantIntentSchema>;

/** One prior turn of the CURRENT chat session (client-held, never persisted). */
export type AssistantChatTurn = {
  role: "user" | "assistant";
  content: string;
};
export type ParsedAssistantCommand = z.infer<typeof parsedAssistantCommandSchema>;

export type AssistantMatchedProduct = {
  productId: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  unit: string;
  packageSize: string;
  imageUrl?: string;
  score: number;
  reasons: string[];
  sources: string[];
};

export type AssistantClarificationOption = {
  productId: string;
  name: string;
  sku: string;
  packageSize: string;
  price: number;
  unit: string;
  imageUrl?: string;
};

/** Short-lived disambiguation session id (Mongo _id string) when persisted. */
export type AssistantClarification = {
  clarificationId?: string;
  question: string;
  options: AssistantClarificationOption[];
  /** Present for staged compare clarifications. */
  compareStep?: "first_product" | "second_product";
  flowType?: "single" | "compare";
};

export type AssistantResolveClarificationRequest = {
  clarificationId: string;
  selectedProductId: string;
};

export type AssistantActionResult =
  | "added"
  | "updated"
  | "removed"
  | "info"
  | "compare"
  | "advice"
  | "clarification_required"
  | "failed";

export type AssistantCommandResponse = {
  intent: AssistantIntent;
  actionResult: AssistantActionResult;
  message: string;
  matchedProducts: AssistantMatchedProduct[];
  chosenProduct: AssistantMatchedProduct | null;
  clarification: AssistantClarification | null;
  metadata?: Record<string, unknown>;
  cart?: unknown;
};

