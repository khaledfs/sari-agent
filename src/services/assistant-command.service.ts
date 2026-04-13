import { z } from "zod";

import {
  createAssistantClarificationRecord,
  planCompareClarification,
  type CompareContextStored,
  type ProductResolutionSide,
} from "@/services/assistant-clarification.service";
import { getAssistantRankedProductCandidates } from "@/services/assistant-candidates.service";
import { decideAssistantProductResolution } from "@/services/assistant-decision.service";
import {
  buildAssistantClarificationMessage,
  buildAssistantCompareMessage,
  buildAssistantInfoMessage,
  buildAssistantNotFoundMessage,
} from "@/services/assistant-explanation.service";
import { runCartMutation } from "@/services/assistant-execution.service";
import { normalizeAssistantText } from "@/services/assistant-normalization.service";
import { parseAssistantCommandWithOpenAI } from "@/services/assistant-parser.service";
import { getFrequentProductsByUser } from "@/services/smart-ordering.service";
import type {
  AssistantCommandResponse,
  AssistantMatchedProduct,
  ParsedAssistantCommand,
} from "@/types/assistant";

const commandInputSchema = z.object({
  userId: z.string().trim().min(1, "userId is required."),
  message: z.string().trim().min(1, "message is required."),
});

async function resolveSingleProduct(
  userId: string,
  rawQuery: string,
  intent: ParsedAssistantCommand["intent"]
): Promise<
  | {
      kind: "execute";
      chosen: AssistantMatchedProduct;
      candidates: AssistantMatchedProduct[];
    }
  | {
      kind: "clarify";
      message: string;
      candidates: AssistantMatchedProduct[];
      clarification: AssistantCommandResponse["clarification"];
    }
  | {
      kind: "not_found";
      message: string;
      suggestions: AssistantMatchedProduct[];
    }
> {
  const normalized = normalizeAssistantText(rawQuery);
  const query = normalized.normalized || rawQuery;
  const candidates = await getAssistantRankedProductCandidates(userId, query, 6);
  const decision = decideAssistantProductResolution(intent, candidates, rawQuery);

  if (decision.kind === "execute") {
    return { kind: "execute", chosen: decision.chosen, candidates };
  }
  if (decision.kind === "clarify") {
    return {
      kind: "clarify",
      message: buildAssistantClarificationMessage(decision.clarification),
      candidates,
      clarification: decision.clarification,
    };
  }
  return {
    kind: "not_found",
    message: buildAssistantNotFoundMessage(rawQuery, decision.suggestions),
    suggestions: decision.suggestions,
  };
}

async function persistClarificationIfNeeded(
  userId: string,
  originalMessage: string,
  parsed: ParsedAssistantCommand,
  clarification: NonNullable<AssistantCommandResponse["clarification"]>,
  compareContext?: CompareContextStored
): Promise<AssistantCommandResponse["clarification"]> {
  if (!clarification.options.length) {
    return clarification;
  }

  const clarificationId = await createAssistantClarificationRecord({
    userId,
    intent: parsed.intent,
    originalMessage,
    productQuery: parsed.productQuery ?? null,
    productQueries: parsed.productQueries ?? [],
    quantity: parsed.quantity ?? null,
    question: clarification.question,
    options: clarification.options.map((o) => ({ ...o })),
    compareContext,
  });

  const compareStep =
    compareContext?.phase === "left" ? "first_product" : compareContext?.phase === "right" ? "second_product" : undefined;

  return {
    ...clarification,
    clarificationId,
    compareStep,
  };
}

export { runAssistantCartCommandResolved } from "@/services/assistant-execution.service";

export async function runAssistantCartCommand(userId: string, message: string): Promise<AssistantCommandResponse> {
  const input = commandInputSchema.parse({ userId, message });
  const parsed = await parseAssistantCommandWithOpenAI(input.message);

  if (parsed.intent === "reorder_habit" && !parsed.productQuery) {
    const frequent = await getFrequentProductsByUser(input.userId);
    const top = frequent[0];
    if (!top) {
      return {
        intent: parsed.intent,
        actionResult: "failed",
        message: "לא מצאתי היסטוריית רכישות מספיקה כדי לבחור מוצר קבוע.",
        matchedProducts: [],
        chosenProduct: null,
        clarification: null,
      };
    }
    const chosen: AssistantMatchedProduct = {
      productId: top._id,
      name: top.name,
      sku: top.sku,
      category: top.category ?? "",
      price: top.price,
      unit: top.unit,
      packageSize: "",
      imageUrl: top.imageUrl,
      score: 80,
      reasons: ["frequent_history"],
      sources: ["frequent"],
    };
    const res = await runCartMutation(input.userId, { ...parsed, intent: "add", quantity: parsed.quantity ?? 1 }, chosen);
    return {
      intent: parsed.intent,
      actionResult: res.actionResult,
      message: res.message,
      matchedProducts: [chosen],
      chosenProduct: chosen,
      clarification: null,
      cart: res.cart,
      metadata: { parsed },
    };
  }

  if (parsed.intent === "compare") {
    const queries = parsed.productQueries?.length
      ? parsed.productQueries.slice(0, 2)
      : parsed.productQuery
        ? [parsed.productQuery]
        : [];

    if (queries.length < 2) {
      return {
        intent: parsed.intent,
        actionResult: "clarification_required",
        message: "כדי לבצע השוואה, ציין שני מוצרים להשוואה.",
        matchedProducts: [],
        chosenProduct: null,
        clarification: {
          question: "איזה שני מוצרים תרצה להשוות?",
          options: [],
        },
      };
    }

    const [q1, q2] = queries;
    const leftRes = await resolveSingleProduct(input.userId, q1, "compare");
    const rightRes = await resolveSingleProduct(input.userId, q2, "compare");

    if (leftRes.kind === "execute" && rightRes.kind === "execute") {
      const messageOut = buildAssistantCompareMessage(leftRes.chosen, rightRes.chosen);
      return {
        intent: parsed.intent,
        actionResult: "compare",
        message: messageOut,
        matchedProducts: [leftRes.chosen, rightRes.chosen],
        chosenProduct: null,
        clarification: null,
        metadata: { parsed },
      };
    }

    const plan = planCompareClarification(leftRes as ProductResolutionSide, rightRes as ProductResolutionSide, q1, q2);
    if (plan) {
      const clarification = await persistClarificationIfNeeded(
        input.userId,
        input.message,
        parsed,
        {
          question: plan.question,
          options: plan.options,
        },
        plan.compareContext
      );
      return {
        intent: parsed.intent,
        actionResult: "clarification_required",
        message: plan.question,
        matchedProducts: plan.matchedProducts,
        chosenProduct: null,
        clarification,
        metadata: { parsed },
      };
    }

    const cands = [
      ...(leftRes.kind === "execute" ? [leftRes.chosen] : leftRes.kind === "clarify" ? leftRes.candidates : leftRes.suggestions),
      ...(rightRes.kind === "execute" ? [rightRes.chosen] : rightRes.kind === "clarify" ? rightRes.candidates : rightRes.suggestions),
    ].slice(0, 4);
    return {
      intent: parsed.intent,
      actionResult: "clarification_required",
      message: "לא הצלחתי לזהות שני מוצרים חד-משמעיים להשוואה. תוכל לדייק שמות?",
      matchedProducts: cands,
      chosenProduct: null,
      clarification: {
        question: "התכוונת לאחד מהמוצרים הבאים?",
        options: cands.map((c) => ({
          productId: c.productId,
          name: c.name,
          sku: c.sku,
          packageSize: c.packageSize,
          price: c.price,
          unit: c.unit,
          imageUrl: c.imageUrl,
        })),
      },
      metadata: { parsed },
    };
  }

  if (parsed.intent === "clarify") {
    return {
      intent: parsed.intent,
      actionResult: "clarification_required",
      message: "כדי שאעזור בדיוק, כתוב שם מוצר וכמות (למשל: תוסיף 3 קמח מלא).",
      matchedProducts: [],
      chosenProduct: null,
      clarification: {
        question: "מה שם המוצר שתרצה?",
        options: [],
      },
      metadata: { parsed },
    };
  }

  const query = parsed.productQuery?.trim() ?? "";
  if (!query) {
    return {
      intent: parsed.intent,
      actionResult: "failed",
      message: "חסר שם מוצר. נסה לכתוב שם מוצר קצר וברור.",
      matchedProducts: [],
      chosenProduct: null,
      clarification: null,
      metadata: { parsed },
    };
  }

  const resolution = await resolveSingleProduct(input.userId, query, parsed.intent);
  if (resolution.kind === "not_found") {
    return {
      intent: parsed.intent,
      actionResult: "failed",
      message: resolution.message,
      matchedProducts: resolution.suggestions,
      chosenProduct: null,
      clarification: null,
      metadata: { parsed },
    };
  }
  if (resolution.kind === "clarify") {
    const rawClarification = resolution.clarification;
    if (!rawClarification) {
      return {
        intent: parsed.intent,
        actionResult: "failed",
        message: "שגיאת הבהרה פנימית.",
        matchedProducts: resolution.candidates,
        chosenProduct: null,
        clarification: null,
        metadata: { parsed },
      };
    }
    const clarification = await persistClarificationIfNeeded(
      input.userId,
      input.message,
      parsed,
      rawClarification
    );
    return {
      intent: parsed.intent,
      actionResult: "clarification_required",
      message: resolution.message,
      matchedProducts: resolution.candidates,
      chosenProduct: null,
      clarification,
      metadata: { parsed },
    };
  }

  const chosen = resolution.chosen;

  if (parsed.intent === "info") {
    return {
      intent: parsed.intent,
      actionResult: "info",
      message: buildAssistantInfoMessage(chosen),
      matchedProducts: resolution.candidates,
      chosenProduct: chosen,
      clarification: null,
      metadata: { parsed },
    };
  }

  const mutation = await runCartMutation(input.userId, parsed, chosen);
  return {
    intent: parsed.intent,
    actionResult: mutation.actionResult,
    message: mutation.message,
    matchedProducts: resolution.candidates,
    chosenProduct: chosen,
    clarification: null,
    cart: mutation.cart,
    metadata: { parsed },
  };
}
