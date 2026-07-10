import { getOpenAIClient } from "@/lib/openai";
import type { AssistantChatTurn } from "@/types/assistant";

export type AssistantMessageRoute = "cart" | "advice";

const routerSystemPrompt = [
  "You classify one user chat message for a B2B wholesale food ordering assistant.",
  "Output exactly one route:",
  '- "cart": the message is about adding/updating/removing a cart item, placing an order, looking up or comparing a specific catalog product by name/SKU, or reordering a past/habitual purchase. Short follow-ups that continue a cart action from earlier turns (e.g. "תוסיף 2 עוד", "again", a brand fragment) are also "cart".',
  '- "advice": the message asks a general culinary, baking, cooking, or wholesale-food-business knowledge question (recommendations, technique, ingredient guidance, best practices) that is not tied to executing a cart action.',
  "Earlier turns of the same conversation may precede the final user message - classify the FINAL user message in their context.",
  'If uncertain, choose "cart" only when the message clearly names or refers to a product to act on; otherwise choose "advice".',
  'Output strict JSON only: {"route": "cart" | "advice"}. No explanations, no extra keys.',
].join("\n");

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Router did not return JSON.");
  }
  return text.slice(start, end + 1);
}

/**
 * Cheap intent router: decides whether a message belongs to the existing
 * cart/order pipeline or the new advisor pipeline. Defaults to "cart" on any
 * failure so the pre-existing cart-command flow is never blocked by this
 * additive classification step.
 */
export async function classifyAssistantMessageRoute(
  message: string,
  conversationHistory: AssistantChatTurn[] = []
): Promise<AssistantMessageRoute> {
  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: process.env.OPENAI_ROUTER_MODEL?.trim() || "gpt-5-mini",
      input: [
        { role: "system", content: routerSystemPrompt },
        ...conversationHistory.slice(-10).map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: message },
      ],
    });

    const raw = response.output_text?.trim();
    if (!raw) return "cart";

    const parsed = JSON.parse(extractJsonObject(raw)) as { route?: unknown };
    return parsed.route === "advice" ? "advice" : "cart";
  } catch {
    return "cart";
  }
}
