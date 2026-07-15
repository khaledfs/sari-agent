import { z } from "zod";

import { getOpenAIClient } from "@/lib/openai";
import { getAssistantRankedProductCandidates } from "@/services/assistant-candidates.service";
import { buildMemorySystemPrompt, getMemoryForUser } from "@/services/customer-memory.service";
import { getGiftPromotionForProduct } from "@/services/promotions.service";
import type { AssistantChatTurn, AssistantCommandResponse, AssistantMatchedProduct } from "@/types/assistant";

export type AdvisorLocale = "he" | "en" | "ar";

const LOCALE_NAMES: Record<AdvisorLocale, string> = {
  he: "Hebrew",
  en: "English",
  ar: "Arabic",
};

/** Deterministic connector strings composed by the service (not the LLM), so
 *  catalog facts (name/price) are never hallucinated. Mirrors the existing
 *  pattern in assistant-explanation.service.ts of building chat text in the
 *  service layer rather than through next-intl. */
const PRODUCT_SUGGESTION_PREFIX: Record<AdvisorLocale, string> = {
  he: "מוצר רלוונטי מהקטלוג שלנו:",
  en: "A relevant product from our catalog:",
  ar: "منتج مناسب من كتالوجنا:",
};

const NO_CATALOG_MATCH_NOTE: Record<AdvisorLocale, string> = {
  he: "לא מצאתי כרגע מוצר תואם בקטלוג שלנו לנושא הזה.",
  en: "I couldn't find a matching product in our catalog for this right now.",
  ar: "لم أجد حالياً منتجاً مطابقاً في كتالوجنا لهذا الموضوع.",
};

// TODO(web-search): wire up the real `web_search` Responses API tool here once
// the cost/plan is approved (see docs/DEV_NOTES.md). Until then we say so honestly
// instead of silently answering as if we checked the web.
const FRESH_INFO_UNAVAILABLE_NOTE: Record<AdvisorLocale, string> = {
  he: "חלק מהשאלה דורש מידע עדכני מהאינטרנט שאין לי גישה אליו כרגע — התשובה למעלה מבוססת על הידע הכללי שלי.",
  en: "Part of this question needs up-to-date web information I don't have access to right now — the answer above is based on my general knowledge.",
  ar: "جزء من هذا السؤال يحتاج معلومات محدّثة من الإنترنت لا أملك وصولاً إليها حالياً — الإجابة أعلاه مبنية على معرفتي العامة.",
};

/** MVP safety threshold, matching product-matching.service.ts's deterministic cutoff. */
const CATALOG_TIE_IN_SCORE_THRESHOLD = 30;

/** Deterministic gift-promotion mention (service-composed, never LLM-generated). */
function buildGiftPromotionNote(
  locale: AdvisorLocale,
  productName: string,
  promo: { buyMinQty: number; giftQty: number; giftProductName: string }
): string {
  const templates: Record<AdvisorLocale, string> = {
    he: `🎁 מבצע פעיל: בקנייה של ${promo.buyMinQty} יחידות של ${productName} מקבלים ${promo.giftQty} × ${promo.giftProductName} מתנה.`,
    en: `🎁 Active promotion: buy ${promo.buyMinQty} units of ${productName} and get ${promo.giftQty} × ${promo.giftProductName} free.`,
    ar: `🎁 عرض فعّال: عند شراء ${promo.buyMinQty} وحدات من ${productName} تحصل على ${promo.giftQty} × ${promo.giftProductName} هدية.`,
  };
  return templates[locale];
}

const advisorOutputSchema = z.object({
  answer: z.string().trim().min(1),
  confidence: z.enum(["high", "low"]),
  needsFreshInfo: z.boolean(),
  productSearchQuery: z.string().trim().min(1).nullable(),
});

type AdvisorLLMResult = z.infer<typeof advisorOutputSchema>;

function buildAdvisorSystemPrompt(localeName: string): string {
  return [
    "You are a culinary and wholesale-food advisor embedded in a B2B bakery/food-trade platform called SARI.",
    "The customer asks cooking, baking, ingredient, or wholesale-food-business questions.",
    "Earlier turns of the same conversation may precede the final user message - use them to resolve follow-up references, but always answer the FINAL user message.",
    `Answer in ${localeName} only, in natural, concise prose (2-5 sentences), like a knowledgeable colleague.`,
    "Answer from your own general knowledge whenever you are reasonably confident - this is the default, fastest, and cheapest path.",
    "If the topic touches food safety (allergens, shelf life, storage temperature, spoilage), weave in one brief, natural, non-alarmist caution using soft language such as \"as a general rule\" or \"it's best to\" - never state definitive medical or food-safety guarantees.",
    "Do NOT mention any specific store product, price, or inventory in the answer text - that is handled separately by the system.",
    "Set productSearchQuery to a short catalog search phrase (2-4 words, same language as the ingredient/product category discussed) if a wholesale product category is clearly relevant to the answer (e.g. a flour type, a chocolate type, an oil). Set it to null if no product category is clearly relevant - never force one.",
    'Set confidence to "low" only if you are not sure your general-knowledge answer is accurate or sufficient for this question.',
    "Set needsFreshInfo to true ONLY if answering well truly requires current, volatile, or highly specific external information you cannot know reliably (e.g. today's market price, a brand-new product release, a live trend) - not for stable culinary or technique knowledge.",
    'Output strict JSON only, exactly these keys: answer (string), confidence ("high"|"low"), needsFreshInfo (boolean), productSearchQuery (string or null). No markdown, no extra keys, no explanations outside the JSON.',
  ].join("\n");
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Advisor did not return JSON.");
  }
  return text.slice(start, end + 1);
}

/**
 * Tolerant parsing of the advisor LLM output. The model occasionally wraps the
 * JSON in markdown fences or answers in plain prose; that must degrade to a
 * usable answer for the user, never to an "invalid JSON" error.
 */
export function parseAdvisorOutput(raw: string): AdvisorLLMResult {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, "").trim();
  try {
    return advisorOutputSchema.parse(JSON.parse(extractJsonObject(cleaned)));
  } catch {
    // Salvage the "answer" string out of malformed JSON if present; otherwise
    // the whole text is the answer (model ignored the JSON instruction).
    const answerMatch = /"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(cleaned);
    let answer = cleaned;
    if (answerMatch) {
      try {
        answer = JSON.parse(`"${answerMatch[1]}"`) as string;
      } catch {
        answer = answerMatch[1];
      }
    }
    if (!answer.trim()) {
      throw new Error("Advisor returned empty output.");
    }
    return { answer: answer.trim(), confidence: "low", needsFreshInfo: false, productSearchQuery: null };
  }
}

async function getAdvisorAnswerFromModel(
  message: string,
  locale: AdvisorLocale,
  memoryBlock: string,
  conversationHistory: AssistantChatTurn[]
): Promise<AdvisorLLMResult> {
  const client = getOpenAIClient();

  const basePrompt = buildAdvisorSystemPrompt(LOCALE_NAMES[locale]);
  const systemPrompt = memoryBlock ? `${memoryBlock}\n\n${basePrompt}` : basePrompt;

  const response = await client.responses.create({
    model: process.env.OPENAI_ADVISOR_MODEL?.trim() || "gpt-5-mini",
    input: [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10).map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: message },
    ],
  });

  const raw = response.output_text?.trim();
  if (!raw) {
    throw new Error("Advisor returned empty output.");
  }

  return parseAdvisorOutput(raw);
}

/**
 * Advice pipeline: answers general culinary/wholesale knowledge questions from
 * the model's own knowledge first, then deterministically (never via the LLM)
 * ties the answer to a real SARI catalog product when one is clearly relevant.
 * Web search is intentionally stubbed - see FRESH_INFO_UNAVAILABLE_NOTE above.
 */
export async function runAssistantAdvisorQuery(
  userId: string,
  message: string,
  locale: AdvisorLocale,
  conversationHistory: AssistantChatTurn[] = []
): Promise<AssistantCommandResponse> {
  // Personalization context (business type, learned preferences) — fail soft:
  // a memory outage must never block an advisory answer.
  let memoryBlock = "";
  try {
    memoryBlock = buildMemorySystemPrompt(await getMemoryForUser(userId));
  } catch {
    memoryBlock = "";
  }

  const result = await getAdvisorAnswerFromModel(message, locale, memoryBlock, conversationHistory);

  const parts = [result.answer];

  if (result.needsFreshInfo) {
    parts.push(FRESH_INFO_UNAVAILABLE_NOTE[locale]);
  }

  let chosenProduct: AssistantMatchedProduct | null = null;
  let matchedProducts: AssistantMatchedProduct[] = [];
  const productQuery = result.productSearchQuery?.trim();

  if (productQuery) {
    try {
      matchedProducts = await getAssistantRankedProductCandidates(userId, productQuery, 3);
    } catch {
      matchedProducts = [];
    }

    const top = matchedProducts[0];
    if (top && top.score >= CATALOG_TIE_IN_SCORE_THRESHOLD) {
      chosenProduct = top;
      parts.push(`${PRODUCT_SUGGESTION_PREFIX[locale]} ${top.name} - ₪${top.price}${top.unit ? `/${top.unit}` : ""}`);

      // Read-only promotions lookup, deterministic text (no LLM math): mention
      // an active gift promotion when the suggested product is its trigger.
      try {
        const giftPromo = await getGiftPromotionForProduct(userId, top.productId);
        if (giftPromo && giftPromo.giftProductName) {
          parts.push(buildGiftPromotionNote(locale, top.name, giftPromo));
        }
      } catch {
        // fail soft — promotions must never break an advisory answer
      }
    } else {
      parts.push(NO_CATALOG_MATCH_NOTE[locale]);
    }
  }

  return {
    intent: "advice",
    actionResult: "advice",
    message: parts.join("\n\n"),
    matchedProducts,
    chosenProduct,
    clarification: null,
    metadata: {
      advisor: {
        confidence: result.confidence,
        needsFreshInfo: result.needsFreshInfo,
      },
    },
  };
}
