import type { AssistantClarification, AssistantIntent, AssistantMatchedProduct } from "@/types/assistant";

export type AssistantDecision =
  | {
      kind: "execute";
      chosen: AssistantMatchedProduct;
      alternatives: AssistantMatchedProduct[];
    }
  | {
      kind: "clarify";
      clarification: AssistantClarification;
      candidates: AssistantMatchedProduct[];
    }
  | {
      kind: "not_found";
      suggestions: AssistantMatchedProduct[];
    };

/**
 * Deterministic decision layer:
 * - execute when one candidate is clearly dominant
 * - clarify when multiple close candidates
 * - fail safely with suggestions when weak/empty match
 */
export function decideAssistantProductResolution(
  intent: AssistantIntent,
  candidates: AssistantMatchedProduct[],
  originalQuery: string
): AssistantDecision {
  if (!candidates.length) {
    return { kind: "not_found", suggestions: [] };
  }
  const top = candidates[0];
  const second = candidates[1];

  const strongThreshold = intent === "info" || intent === "compare" ? 42 : 48;
  if (!second) {
    if (top.score >= 26) {
      return { kind: "execute", chosen: top, alternatives: [] };
    }
    return { kind: "not_found", suggestions: candidates.slice(0, 3) };
  }

  const gap = top.score - second.score;
  const clearlyDominant = top.score >= strongThreshold && gap >= 8;
  if (clearlyDominant) {
    return { kind: "execute", chosen: top, alternatives: candidates.slice(1, 3) };
  }

  const topClose = candidates.filter((c) => top.score - c.score <= 6).slice(0, 3);
  return {
    kind: "clarify",
    clarification: {
      question:
        topClose.length >= 2
          ? `מצאתי כמה התאמות עבור "${originalQuery}". איזה מוצר התכוונת?`
          : `כדי לדייק, תוכל לחדד את שם המוצר?`,
      options: topClose.map((c) => ({
        productId: c.productId,
        name: c.name,
        sku: c.sku,
        packageSize: c.packageSize,
        price: c.price,
        unit: c.unit,
        imageUrl: c.imageUrl,
      })),
    },
    candidates: topClose,
  };
}
