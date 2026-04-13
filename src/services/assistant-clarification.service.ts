import mongoose, { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import { AssistantClarificationModel } from "@/models/assistant-clarification.model";
import { getAssistantRankedProductCandidates } from "@/services/assistant-candidates.service";
import { buildAssistantCompareMessage } from "@/services/assistant-explanation.service";
import {
  matchedProductFromDb,
  runAssistantCartCommandResolved,
} from "@/services/assistant-execution.service";
import type {
  AssistantClarification,
  AssistantClarificationOption,
  AssistantCommandResponse,
  AssistantIntent,
  AssistantMatchedProduct,
} from "@/types/assistant";

/** Default window for clarification records (Mongo TTL on expiresAt). */
export const ASSISTANT_CLARIFICATION_TTL_MS = 20 * 60 * 1000;

export type StoredClarificationOption = AssistantClarificationOption;

export type CompareContextStored = {
  phase: "left" | "right";
  leftQuery: string;
  rightQuery: string;
  anchoredSide?: "left" | "right";
  anchoredProduct?: StoredClarificationOption;
  firstPick?: StoredClarificationOption;
  secondStepOptions?: StoredClarificationOption[];
};

export type ProductResolutionSide =
  | {
      kind: "execute";
      chosen: AssistantMatchedProduct;
      candidates: AssistantMatchedProduct[];
    }
  | {
      kind: "clarify";
      message: string;
      candidates: AssistantMatchedProduct[];
      clarification: { question: string; options: AssistantClarificationOption[] };
    }
  | {
      kind: "not_found";
      message: string;
      suggestions: AssistantMatchedProduct[];
    };

export function optionFromMatched(p: AssistantMatchedProduct): StoredClarificationOption {
  return {
    productId: p.productId,
    name: p.name,
    sku: p.sku,
    price: p.price,
    unit: p.unit,
    packageSize: p.packageSize,
    imageUrl: p.imageUrl,
  };
}

export function storedOptionsFromSide(res: ProductResolutionSide): StoredClarificationOption[] {
  if (res.kind === "clarify" && res.clarification.options.length) {
    return res.clarification.options.map((o) => ({ ...o }));
  }
  if (res.kind === "not_found" && res.suggestions.length) {
    return res.suggestions.slice(0, 3).map(optionFromMatched);
  }
  return [];
}

function chosenFromSide(res: ProductResolutionSide): AssistantMatchedProduct | null {
  return res.kind === "execute" ? res.chosen : null;
}

function mergeCandidates(leftRes: ProductResolutionSide, rightRes: ProductResolutionSide): AssistantMatchedProduct[] {
  const a =
    leftRes.kind === "execute"
      ? [leftRes.chosen]
      : leftRes.kind === "clarify"
        ? leftRes.candidates
        : leftRes.suggestions;
  const b =
    rightRes.kind === "execute"
      ? [rightRes.chosen]
      : rightRes.kind === "clarify"
        ? rightRes.candidates
        : rightRes.suggestions;
  return [...a, ...b].slice(0, 6);
}

/**
 * Plans a staged compare clarification (no DB write).
 * Returns null if there is no safe option list to show.
 */
export function planCompareClarification(
  leftRes: ProductResolutionSide,
  rightRes: ProductResolutionSide,
  leftQuery: string,
  rightQuery: string
): {
  question: string;
  options: StoredClarificationOption[];
  compareContext: CompareContextStored;
  compareStep: "first_product" | "second_product";
  matchedProducts: AssistantMatchedProduct[];
} | null {
  const leftChosen = chosenFromSide(leftRes);
  const rightChosen = chosenFromSide(rightRes);
  const leftOpts = storedOptionsFromSide(leftRes);
  const rightOpts = storedOptionsFromSide(rightRes);

  if (leftChosen && rightChosen) {
    return null;
  }

  if (leftChosen && !rightChosen) {
    if (!rightOpts.length) return null;
    return {
      question: `בחר מוצר להשוואה מול "${rightQuery}"`,
      options: rightOpts,
      compareContext: {
        phase: "right",
        leftQuery,
        rightQuery,
        anchoredSide: "left",
        anchoredProduct: optionFromMatched(leftChosen),
      },
      compareStep: "second_product",
      matchedProducts: mergeCandidates(leftRes, rightRes),
    };
  }

  if (!leftChosen && rightChosen) {
    if (!leftOpts.length) return null;
    return {
      question: `בחר מוצר להשוואה מול "${leftQuery}"`,
      options: leftOpts,
      compareContext: {
        phase: "left",
        leftQuery,
        rightQuery,
        anchoredSide: "right",
        anchoredProduct: optionFromMatched(rightChosen),
      },
      compareStep: "first_product",
      matchedProducts: mergeCandidates(leftRes, rightRes),
    };
  }

  if (!leftOpts.length && !rightOpts.length) {
    return null;
  }

  if (!leftOpts.length) {
    return null;
  }

  return {
    question: `בחר מוצר עבור "${leftQuery}" (אחר כך נבחר את המוצר ל"${rightQuery}")`,
    options: leftOpts,
    compareContext: {
      phase: "left",
      leftQuery,
      rightQuery,
      secondStepOptions: rightOpts.length ? rightOpts : undefined,
    },
    compareStep: "first_product",
    matchedProducts: mergeCandidates(leftRes, rightRes),
  };
}

export type CreateAssistantClarificationParams = {
  userId: string;
  intent: AssistantIntent;
  originalMessage: string;
  productQuery: string | null;
  productQueries: string[];
  quantity: number | null;
  question: string;
  options: StoredClarificationOption[];
  compareContext?: CompareContextStored;
};

export async function createAssistantClarificationRecord(params: CreateAssistantClarificationParams): Promise<string> {
  await connectDB();
  const expiresAt = new Date(Date.now() + ASSISTANT_CLARIFICATION_TTL_MS);
  const doc = await AssistantClarificationModel.create({
    userId: params.userId,
    intent: params.intent,
    originalMessage: params.originalMessage,
    productQuery: params.productQuery,
    productQueries: params.productQueries,
    quantity: params.quantity,
    question: params.question,
    options: params.options,
    compareContext: params.compareContext,
    status: "pending",
    expiresAt,
  });
  return String(doc._id);
}

function clarificationPayloadFromDoc(
  doc: {
    _id: unknown;
    question?: string;
    options: StoredClarificationOption[];
    compareContext?: CompareContextStored;
  },
  questionFallback: string
): AssistantClarification {
  const compareStep =
    doc.compareContext?.phase === "left" ? "first_product" : doc.compareContext?.phase === "right" ? "second_product" : undefined;
  return {
    clarificationId: String(doc._id),
    question: doc.question ?? questionFallback,
    options: doc.options.map((o) => ({ ...o })),
    compareStep,
  };
}

async function markResolved(clarificationId: string) {
  await AssistantClarificationModel.updateOne(
    { _id: new mongoose.Types.ObjectId(clarificationId) },
    { $set: { status: "resolved", resolvedAt: new Date() } }
  ).exec();
}

function findOption(options: StoredClarificationOption[], productId: string): StoredClarificationOption | null {
  return options.find((o) => o.productId === productId) ?? null;
}

function plainOptionsFromDoc(options: unknown): StoredClarificationOption[] {
  if (!Array.isArray(options)) return [];
  return options.map((o) => {
    const r = o as Record<string, unknown>;
    return {
      productId: String(r.productId ?? ""),
      name: String(r.name ?? ""),
      sku: String(r.sku ?? ""),
      price: Number(r.price ?? 0),
      unit: String(r.unit ?? ""),
      packageSize: String(r.packageSize ?? ""),
      imageUrl: r.imageUrl ? String(r.imageUrl) : undefined,
    };
  });
}

async function finalizeCompare(
  userId: string,
  left: AssistantMatchedProduct,
  right: AssistantMatchedProduct,
  clarificationId: string
): Promise<AssistantCommandResponse> {
  await markResolved(clarificationId);
  return {
    intent: "compare",
    actionResult: "compare",
    message: buildAssistantCompareMessage(left, right),
    matchedProducts: [left, right],
    chosenProduct: null,
    clarification: null,
    metadata: { resolvedClarification: true, clarificationId },
  };
}

/**
 * Deterministic clarification resolve (no LLM). Throws Error with Hebrew/ASCII message on failure.
 */
export async function resolveAssistantClarification(
  userId: string,
  clarificationId: string,
  selectedProductId: string
): Promise<AssistantCommandResponse> {
  if (!isValidObjectId(clarificationId)) {
    throw new Error("מזהה הבהרה לא תקין.");
  }

  await connectDB();
  const doc = await AssistantClarificationModel.findById(clarificationId).lean();
  if (!doc || doc.userId !== userId) {
    throw new Error("לא נמצאה הבהרה פעילה.");
  }

  if (doc.status !== "pending") {
    throw new Error("הבהרה כבר טופלה.");
  }

  if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) {
    await AssistantClarificationModel.updateOne({ _id: doc._id }, { $set: { status: "expired" } }).exec();
    throw new Error("פג תוקף הבהרה. שלח את הבקשה מחדש.");
  }

  const intent = doc.intent as AssistantIntent;

  if (intent === "compare" && doc.compareContext) {
    return resolveCompareSelection(userId, {
      _id: doc._id,
      userId: doc.userId,
      options: plainOptionsFromDoc(doc.options),
      compareContext: doc.compareContext as CompareContextStored,
      intent: doc.intent,
    }, selectedProductId);
  }

  if (intent === "compare") {
    throw new Error("הבהרה לא תקינה להשוואה.");
  }

  const selected = findOption(plainOptionsFromDoc(doc.options), selectedProductId);
  if (!selected) {
    throw new Error("הבחירה אינה אחת מהאפשרויות שהוצעו.");
  }

  const res = await runAssistantCartCommandResolved(userId, {
    productId: selectedProductId,
    intent,
    quantity: doc.quantity ?? null,
  });

  if (res.actionResult === "failed") {
    throw new Error(res.message || "לא ניתן להשלים את הפעולה.");
  }

  await markResolved(clarificationId);
  return {
    ...res,
    metadata: { ...res.metadata, resolvedClarification: true, clarificationId },
  };
}

async function resolveCompareSelection(
  userId: string,
  doc: {
    _id: unknown;
    userId: string;
    options: StoredClarificationOption[];
    compareContext?: CompareContextStored;
    intent?: string;
  },
  selectedProductId: string
): Promise<AssistantCommandResponse> {
  const ctx = doc.compareContext;
  if (!ctx) {
    throw new Error("חסר הקשר השוואה.");
  }

  const clarificationId = String(doc._id);

  if (ctx.phase === "left") {
    const selected = findOption(doc.options, selectedProductId);
    if (!selected) {
      throw new Error("הבחירה אינה אחת מהאפשרויות שהוצעו.");
    }

    if (ctx.anchoredSide === "right" && ctx.anchoredProduct) {
      const left = await matchedProductFromDb(selectedProductId);
      const right = await matchedProductFromDb(ctx.anchoredProduct.productId);
      return finalizeCompare(userId, left, right, clarificationId);
    }

    let second = ctx.secondStepOptions?.length ? ctx.secondStepOptions : [];
    if (!second.length) {
      const ranked = await getAssistantRankedProductCandidates(userId, ctx.rightQuery, 6);
      second = ranked.slice(0, 6).map(optionFromMatched);
    }
    if (!second.length) {
      throw new Error("לא נמצאו מועמדים למוצר השני.");
    }

    await connectDB();
    const nextQuestion = `בחר מוצר עבור "${ctx.rightQuery}"`;
    await AssistantClarificationModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          options: second,
          question: nextQuestion,
          "compareContext.phase": "right",
          "compareContext.firstPick": selected,
          "compareContext.secondStepOptions": [],
        },
      }
    ).exec();

    const updated = await AssistantClarificationModel.findById(doc._id).lean();
    if (!updated) {
      throw new Error("לא ניתן לעדכן את ההבהרה.");
    }

    return {
      intent: "compare",
      actionResult: "clarification_required",
      message: `בחר מוצר עבור "${ctx.rightQuery}"`,
      matchedProducts: second.map(
        (o) =>
          ({
            productId: o.productId,
            name: o.name,
            sku: o.sku,
            category: "",
            price: o.price,
            unit: o.unit,
            packageSize: o.packageSize,
            imageUrl: o.imageUrl,
            score: 0,
            reasons: [],
            sources: [],
          }) satisfies AssistantMatchedProduct
      ),
      chosenProduct: null,
      clarification: clarificationPayloadFromDoc(
        {
          _id: updated._id,
          question: updated.question,
          options: updated.options as StoredClarificationOption[],
          compareContext: updated.compareContext as CompareContextStored,
        },
        `בחר מוצר עבור "${ctx.rightQuery}"`
      ),
      metadata: { compareStaged: true, clarificationId },
    };
  }

  if (ctx.phase === "right") {
    const selected = findOption(doc.options, selectedProductId);
    if (!selected) {
      throw new Error("הבחירה אינה אחת מהאפשרויות שהוצעו.");
    }

    if (ctx.anchoredSide === "left" && ctx.anchoredProduct) {
      const left = await matchedProductFromDb(ctx.anchoredProduct.productId);
      const right = await matchedProductFromDb(selectedProductId);
      return finalizeCompare(userId, left, right, clarificationId);
    }

    if (ctx.firstPick) {
      const left = await matchedProductFromDb(ctx.firstPick.productId);
      const right = await matchedProductFromDb(selectedProductId);
      return finalizeCompare(userId, left, right, clarificationId);
    }

    throw new Error("חסר מוצר ראשון בהשוואה.");
  }

  throw new Error("שלב הבהרה לא נתמך.");
}

export async function getPendingClarificationForUser(userId: string) {
  await connectDB();
  return AssistantClarificationModel.findOne({
    userId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
}

export async function getClarificationByIdForUser(userId: string, clarificationId: string) {
  if (!isValidObjectId(clarificationId)) {
    return null;
  }
  await connectDB();
  const doc = await AssistantClarificationModel.findById(clarificationId).lean();
  if (!doc || doc.userId !== userId) {
    return null;
  }
  return doc;
}
