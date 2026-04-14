import type { AssistantClarification, AssistantMatchedProduct } from "@/types/assistant";

function explainReason(product: AssistantMatchedProduct): string {
  if (product.reasons.includes("explicit_favorite")) {
    return "כי זה מוצר שסימנת כמועדף.";
  }
  if (product.reasons.includes("frequent_history")) {
    return "כי זה מוצר שאתה מזמין בתדירות גבוהה.";
  }
  if (product.reasons.includes("recent_history")) {
    return "כי הזמנת אותו לאחרונה.";
  }
  if (product.reasons.includes("token_overlap") || product.reasons.includes("contains_normalized_query")) {
    return "כי הוא תואם הכי טוב לטקסט שביקשת.";
  }
  return "כי זו ההתאמה הטובה ביותר שמצאתי.";
}

export function buildAssistantActionMessage(
  action: "added" | "updated" | "removed",
  product: AssistantMatchedProduct,
  quantity?: number
): string {
  if (action === "added") {
    return `הוספתי ${quantity ?? 1} יחידות של ${product.name}. ${explainReason(product)}`;
  }
  if (action === "updated") {
    return `עדכנתי את ${product.name} לכמות ${quantity ?? 0}. ${explainReason(product)}`;
  }
  return `הסרתי את ${product.name} מהעגלה.`;
}

export function buildAssistantNotFoundMessage(query: string, suggestions: AssistantMatchedProduct[]): string {
  if (!suggestions.length) {
    return `לא מצאתי מוצר מתאים עבור "${query}". נסה שם קצר יותר או מק"ט.`;
  }
  const top = suggestions.slice(0, 3).map((s) => s.name).join(", ");
  return `לא מצאתי התאמה חד-משמעית עבור "${query}". אולי התכוונת ל: ${top}.`;
}

export function buildAssistantClarificationMessage(clarification: AssistantClarification): string {
  return clarification.question;
}

export function buildAssistantInfoMessage(product: AssistantMatchedProduct): string {
  const pack = product.packageSize ? `, אריזה: ${product.packageSize}` : "";
  return `${product.name} | קטגוריה: ${product.category || "לא ידוע"} | מחיר: ${product.price} / ${
    product.unit || "יח'"
  }${pack}. ${explainReason(product)}`;
}

export function buildAssistantCompareMessage(left: AssistantMatchedProduct, right: AssistantMatchedProduct): string {
  const categoryPart =
    left.category && right.category && left.category !== right.category
      ? `קטגוריות שונות: ${left.category} מול ${right.category}.`
      : "";
  const pricePart =
    left.price === right.price
      ? "לשניהם אותו מחיר."
      : left.price < right.price
        ? `${left.name} זול יותר.`
        : `${right.name} זול יותר.`;
  return [
    "השוואה בין שני המוצרים:",
    `${left.name} מול ${right.name}:`,
    `• ${left.name}: ${left.price}/${left.unit || "יח'"}${left.packageSize ? `, ${left.packageSize}` : ""}`,
    `• ${right.name}: ${right.price}/${right.unit || "יח'"}${right.packageSize ? `, ${right.packageSize}` : ""}`,
    categoryPart,
    pricePart,
  ].join(" ");
}
