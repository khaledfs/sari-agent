import { z } from "zod";

import {
  createAssistantClarificationRecord,
  optionFromMatched,
  type CompareContextStored,
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
  AssistantChatTurn,
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
  compareContext?: CompareContextStored,
  flowType: "single" | "compare" = "single",
  step?: "select_first" | "select_second",
  firstProductId?: string
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
    flowType,
    step,
    firstProductId,
    compareContext,
  });

  const compareStep =
    step === "select_first" ? "first_product" : step === "select_second" ? "second_product" : undefined;

  return {
    ...clarification,
    clarificationId,
    compareStep,
    flowType,
  };
}

export { runAssistantCartCommandResolved } from "@/services/assistant-execution.service";

export async function runAssistantCartCommand(
  userId: string,
  message: string,
  conversationHistory: AssistantChatTurn[] = []
): Promise<AssistantCommandResponse> {
  const input = commandInputSchema.parse({ userId, message });
  const parsed = await parseAssistantCommandWithOpenAI(input.message, conversationHistory);

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
        ? [parsed.productQuery, parsed.productQuery]
        : [input.message, input.message];

    const q1 = queries[0] ?? input.message;
    const q2 = queries[1] ?? queries[0] ?? input.message;
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

    const firstOptions =
      leftRes.kind === "execute"
        ? [optionFromMatched(leftRes.chosen), ...leftRes.candidates.slice(0, 5).map(optionFromMatched)]
        : leftRes.kind === "clarify"
          ? (leftRes.clarification?.options ?? []).map((o) => ({ ...o }))
          : leftRes.suggestions.slice(0, 5).map(optionFromMatched);
    const uniqueFirstOptions = firstOptions.filter((opt, i, arr) => arr.findIndex((x) => x.productId === opt.productId) === i).slice(0, 6);
    if (!uniqueFirstOptions.length) {
      return {
        intent: parsed.intent,
        actionResult: "failed",
        message: "לא מצאתי מוצרים מתאימים להתחלת השוואה.",
        matchedProducts: [],
        chosenProduct: null,
        clarification: null,
        metadata: { parsed },
      };
    }
    const compareContext: CompareContextStored = { phase: "left", leftQuery: q1, rightQuery: q2 };
    const question = "בחר מוצר ראשון להשוואה";
    const clarification = await persistClarificationIfNeeded(
      input.userId,
      input.message,
      parsed,
      { question, options: uniqueFirstOptions },
      compareContext,
      "compare",
      "select_first"
    );
    const cands = [
      ...(leftRes.kind === "execute" ? [leftRes.chosen] : leftRes.kind === "clarify" ? leftRes.candidates : leftRes.suggestions),
      ...(rightRes.kind === "execute" ? [rightRes.chosen] : rightRes.kind === "clarify" ? rightRes.candidates : rightRes.suggestions),
    ].slice(0, 6);
    return {
      intent: parsed.intent,
      actionResult: "clarification_required",
      message: question,
      matchedProducts: cands,
      chosenProduct: null,
      clarification,
      metadata: { parsed },
    };
  }

  // The canned "write product name + quantity" instruction was DELETED (Work
  // Order Issue 6): the assistant never demands a command format. This legacy
  // route only remains for old-style clarification continuations; a truly
  // ambiguous message gets a natural question instead.
  if (parsed.intent === "clarify") {
    return {
      intent: parsed.intent,
      actionResult: "clarification_required",
      message: "לא הצלחתי להבין למה התכוונת — איזה מוצר לחפש עבורך?",
      matchedProducts: [],
      chosenProduct: null,
      clarification: {
        question: "איזה מוצר לחפש עבורך?",
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
      message: "לא זיהיתי איזה מוצר חיפשת — אפשר לנסח שוב חופשי, ואחפש בקטלוג.",
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
