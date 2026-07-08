import { z } from "zod";

import { getOpenAIClient } from "@/lib/openai";
import { getAssistantRankedProductCandidates } from "@/services/assistant-candidates.service";
import type { AssistantCommandResponse, AssistantMatchedProduct } from "@/types/assistant";

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

async function getAdvisorAnswerFromModel(message: string, locale: AdvisorLocale): Promise<AdvisorLLMResult> {
  const client = getOpenAIClient();

  const response = await client.responses.create({
    model: process.env.OPENAI_ADVISOR_MODEL?.trim() || "gpt-5-mini",
    input: [
      { role: "system", content: buildAdvisorSystemPrompt(LOCALE_NAMES[locale]) },
      { role: "user", content: message },
    ],
  });

  const raw = response.output_text?.trim();
  if (!raw) {
    throw new Error("Advisor returned empty output.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(raw));
  } catch {
    throw new Error("Advisor returned invalid JSON.");
  }

  return advisorOutputSchema.parse(parsed);
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
  locale: AdvisorLocale
): Promise<AssistantCommandResponse> {
  const result = await getAdvisorAnswerFromModel(message, locale);

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
